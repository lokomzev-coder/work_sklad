"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getOrgContext } from "@/lib/tenant";
import { assertPermission } from "@/lib/permissions";
import { getDefaultStatusId, getAllowedNextStatusIds } from "@/lib/document-statuses";
import { dispatchWebhookEvent } from "@/lib/webhooks";
import { saveCustomFieldValuesRecord } from "@/lib/custom-fields";

const lineItemSchema = z.object({
  catalogItemId: z.string().min(1),
  variantId: z.string().min(1).nullable().optional(),
  quantity: z.coerce.number().positive("Количество должно быть больше 0"),
});

const upsertOrderSchema = z.object({
  clientId: z.string().min(1).nullable(),
  assignedEmployeeId: z.string().min(1).nullable(),
  contractId: z.string().min(1).nullable().optional(),
  salesChannelId: z.string().min(1).nullable().optional(),
  legalEntityId: z.string().min(1).nullable().optional(),
  lineItems: z.array(lineItemSchema).min(1, "Добавьте хотя бы одну позицию"),
});

export interface UpsertOrderInput {
  clientId: string | null;
  assignedEmployeeId: string | null;
  contractId?: string | null;
  salesChannelId?: string | null;
  legalEntityId?: string | null;
  lineItems: { catalogItemId: string; variantId?: string | null; quantity: number }[];
  customFieldValues?: Record<string, string>;
}

export interface UpsertOrderResult {
  error?: string;
  orderId?: string;
}

async function nextOrderNumber(orgId: string): Promise<number> {
  const last = await prisma.order.findFirst({
    where: { orgId },
    orderBy: { number: "desc" },
    select: { number: true },
  });
  return (last?.number ?? 0) + 1;
}

/** Block I: an OWN-scoped custom role may only touch orders assigned to its
 * own Employee record. Thrown as a plain Error, same as assertPermission. */
async function assertOwnOrderScope(
  ctx: { orgId: string; orderScope: "ALL" | "OWN"; employeeId: string | null },
  orderId: string,
) {
  if (ctx.orderScope !== "OWN") return;
  const order = await prisma.order.findFirst({
    where: { id: orderId, orgId: ctx.orgId },
    select: { assignedEmployeeId: true },
  });
  if (!order || order.assignedEmployeeId !== ctx.employeeId) {
    throw new Error("Недостаточно прав: этот заказ назначен не вам");
  }
}

export async function upsertOrder(
  orgSlug: string,
  orderId: string | null,
  input: UpsertOrderInput,
): Promise<UpsertOrderResult> {
  const ctx = await getOrgContext(orgSlug);
  assertPermission(ctx.role, "orders", "edit");
  if (orderId) {
    await assertOwnOrderScope(ctx, orderId);
  }

  const parsed = upsertOrderSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Неверные данные" };
  }
  // OWN-scoped roles can only ever create/keep orders assigned to themselves
  // — overriding the submitted value (rather than rejecting it) means the
  // combobox can stay editable in the UI without a special-cased read-only
  // variant just for this one role shape.
  if (ctx.orderScope === "OWN") {
    parsed.data.assignedEmployeeId = ctx.employeeId;
  }

  const catalogItemIds = [
    ...new Set(parsed.data.lineItems.map((li) => li.catalogItemId)),
  ];
  const catalogItems = await prisma.catalogItem.findMany({
    where: { id: { in: catalogItemIds }, orgId: ctx.orgId },
  });
  if (catalogItems.length !== catalogItemIds.length) {
    return { error: "Один из товаров/услуг не найден" };
  }
  const priceById = new Map(catalogItems.map((c) => [c.id, c.unitPrice]));
  const currencyById = new Map(catalogItems.map((c) => [c.id, c.currency]));

  const variantIds = [
    ...new Set(parsed.data.lineItems.map((li) => li.variantId).filter((v): v is string => !!v)),
  ];
  const variants = variantIds.length
    ? await prisma.catalogItemVariant.findMany({ where: { id: { in: variantIds } } })
    : [];
  const variantById = new Map(variants.map((v) => [v.id, v]));
  for (const li of parsed.data.lineItems) {
    if (li.variantId) {
      const variant = variantById.get(li.variantId);
      if (!variant || variant.catalogItemId !== li.catalogItemId) {
        return { error: "Модификация не найдена" };
      }
    }
  }

  if (parsed.data.contractId) {
    const contract = await prisma.contract.findFirst({
      where: { id: parsed.data.contractId, orgId: ctx.orgId },
    });
    if (!contract) {
      return { error: "Договор не найден" };
    }
  }
  if (parsed.data.salesChannelId) {
    const channel = await prisma.salesChannel.findFirst({
      where: { id: parsed.data.salesChannelId, orgId: ctx.orgId },
    });
    if (!channel) {
      return { error: "Канал продаж не найден" };
    }
  }
  if (parsed.data.legalEntityId) {
    const legalEntity = await prisma.legalEntity.findFirst({
      where: { id: parsed.data.legalEntityId, orgId: ctx.orgId },
    });
    if (!legalEntity) {
      return { error: "Юрлицо не найдено" };
    }
  }

  const lineItemsCreateData = parsed.data.lineItems.map((li) => {
    const variant = li.variantId ? variantById.get(li.variantId) : undefined;
    return {
      catalogItemId: li.catalogItemId,
      variantId: li.variantId ?? undefined,
      quantity: li.quantity,
      // price is snapshotted at order time, so later catalog price edits
      // don't retroactively change already-placed orders
      unitPriceSnapshot: variant?.priceOverride ?? priceById.get(li.catalogItemId)!,
      currency: currencyById.get(li.catalogItemId)!,
    };
  });

  let orderIdResult: string;
  let isNewOrder = false;

  if (orderId) {
    await prisma.$transaction([
      prisma.orderLineItem.deleteMany({ where: { orderId } }),
      prisma.order.update({
        where: { id: orderId, orgId: ctx.orgId },
        data: {
          clientId: parsed.data.clientId,
          assignedEmployeeId: parsed.data.assignedEmployeeId,
          contractId: parsed.data.contractId ?? null,
          salesChannelId: parsed.data.salesChannelId ?? null,
          legalEntityId: parsed.data.legalEntityId ?? null,
          lineItems: { create: lineItemsCreateData },
        },
      }),
    ]);
    orderIdResult = orderId;
  } else {
    // Low concurrency expected (single org admin creating orders); a
    // duplicate-number race is rare enough that we don't retry here.
    const [number, statusId] = await Promise.all([
      nextOrderNumber(ctx.orgId),
      getDefaultStatusId(ctx.orgId, "ORDER"),
    ]);
    const order = await prisma.order.create({
      data: {
        orgId: ctx.orgId,
        number,
        statusId,
        clientId: parsed.data.clientId,
        assignedEmployeeId: parsed.data.assignedEmployeeId,
        contractId: parsed.data.contractId ?? null,
        salesChannelId: parsed.data.salesChannelId ?? null,
        legalEntityId: parsed.data.legalEntityId ?? null,
        lineItems: { create: lineItemsCreateData },
      },
    });
    orderIdResult = order.id;
    isNewOrder = true;
  }

  if (input.customFieldValues) {
    await saveCustomFieldValuesRecord(ctx.orgId, "ORDER", orderIdResult, input.customFieldValues);
  }

  revalidatePath(`/${orgSlug}/orders`);
  revalidatePath(`/${orgSlug}/orders/${orderIdResult}`);
  if (isNewOrder) {
    dispatchWebhookEvent(ctx.orgId, "ORDER_CREATED", { orderId: orderIdResult });
  }
  return { orderId: orderIdResult };
}

export async function updateOrderStatus(
  orgSlug: string,
  orderId: string,
  statusId: string,
) {
  const ctx = await getOrgContext(orgSlug);
  assertPermission(ctx.role, "orders", "edit");
  await assertOwnOrderScope(ctx, orderId);

  const order = await prisma.order.findFirst({
    where: { id: orderId, orgId: ctx.orgId },
    select: { statusId: true },
  });
  if (!order) {
    throw new Error("Заказ не найден");
  }

  const status = await prisma.documentStatus.findFirst({
    where: { id: statusId, orgId: ctx.orgId, kind: "ORDER" },
  });
  if (!status) {
    throw new Error("Статус не найден");
  }

  if (statusId !== order.statusId) {
    const allowed = await getAllowedNextStatusIds(ctx.orgId, "ORDER", order.statusId, ctx.role);
    if (!allowed.has(statusId)) {
      throw new Error("Такой переход между статусами запрещён");
    }
  }

  await prisma.order.update({
    where: { id: orderId, orgId: ctx.orgId },
    data: { statusId },
  });

  revalidatePath(`/${orgSlug}/orders`);
  revalidatePath(`/${orgSlug}/orders/${orderId}`);
  dispatchWebhookEvent(ctx.orgId, "ORDER_STATUS_CHANGED", { orderId, statusId });
}

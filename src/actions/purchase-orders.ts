"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getOrgContext } from "@/lib/tenant";
import { assertPermission } from "@/lib/permissions";
import { assertRowScope, resolveGroupMemberIds } from "@/lib/scope";
import { getDefaultStatusId, getAllowedNextStatusIds } from "@/lib/document-statuses";
import { dispatchWebhookEvent } from "@/lib/webhooks";
import { saveCustomFieldValuesRecord } from "@/lib/custom-fields";

const lineItemSchema = z.object({
  catalogItemId: z.string().min(1),
  quantity: z.coerce.number().positive("Количество должно быть больше 0"),
  unitCost: z.coerce.number().min(0, "Цена не может быть отрицательной"),
});

const upsertPurchaseOrderSchema = z.object({
  supplierId: z.string().min(1).nullable(),
  assignedEmployeeId: z.string().min(1).nullable(),
  contractId: z.string().min(1).nullable().optional(),
  legalEntityId: z.string().min(1).nullable().optional(),
  lineItems: z.array(lineItemSchema).min(1, "Добавьте хотя бы одну позицию"),
});

export interface UpsertPurchaseOrderInput {
  supplierId: string | null;
  assignedEmployeeId: string | null;
  contractId?: string | null;
  legalEntityId?: string | null;
  lineItems: { catalogItemId: string; quantity: number; unitCost: number }[];
  customFieldValues?: Record<string, string>;
}

export interface UpsertPurchaseOrderResult {
  error?: string;
  purchaseOrderId?: string;
}

async function nextPurchaseOrderNumber(orgId: string): Promise<number> {
  const last = await prisma.purchaseOrder.findFirst({
    where: { orgId },
    orderBy: { number: "desc" },
    select: { number: true },
  });
  return (last?.number ?? 0) + 1;
}

export async function upsertPurchaseOrder(
  orgSlug: string,
  purchaseOrderId: string | null,
  input: UpsertPurchaseOrderInput,
): Promise<UpsertPurchaseOrderResult> {
  const ctx = await getOrgContext(orgSlug);
  assertPermission(ctx, "purchaseOrders", purchaseOrderId ? "edit" : "create");
  if (purchaseOrderId) {
    await assertRowScope(ctx, "purchaseOrders", purchaseOrderId);
  }

  const parsed = upsertPurchaseOrderSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Неверные данные" };
  }
  // Same override-not-reject approach as upsertOrder: an OWN-scoped role can
  // only ever create/keep POs assigned to themselves; OWN_GROUP validates
  // against the actor's own department rather than silently overriding.
  const poEditScope = ctx.capabilities.purchaseOrders.edit;
  if (poEditScope === "OWN") {
    parsed.data.assignedEmployeeId = ctx.employeeId;
  } else if (poEditScope === "OWN_GROUP" && parsed.data.assignedEmployeeId) {
    const memberIds = ctx.groupId ? await resolveGroupMemberIds(ctx.orgId, ctx.groupId) : [];
    if (!memberIds.includes(parsed.data.assignedEmployeeId)) {
      return { error: "Можно назначить только на сотрудника вашего отдела" };
    }
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
  const currencyById = new Map(catalogItems.map((c) => [c.id, c.currency]));

  if (parsed.data.contractId) {
    const contract = await prisma.contract.findFirst({
      where: { id: parsed.data.contractId, orgId: ctx.orgId },
    });
    if (!contract) {
      return { error: "Договор не найден" };
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

  const lineItemsCreateData = parsed.data.lineItems.map((li) => ({
    catalogItemId: li.catalogItemId,
    quantity: li.quantity,
    unitPriceSnapshot: li.unitCost,
    currency: currencyById.get(li.catalogItemId)!,
  }));

  let purchaseOrderIdResult: string;
  let isNewPurchaseOrder = false;

  if (purchaseOrderId) {
    await prisma.$transaction([
      prisma.purchaseOrderLineItem.deleteMany({ where: { purchaseOrderId } }),
      prisma.purchaseOrder.update({
        where: { id: purchaseOrderId, orgId: ctx.orgId },
        data: {
          supplierId: parsed.data.supplierId,
          assignedEmployeeId: parsed.data.assignedEmployeeId,
          contractId: parsed.data.contractId ?? null,
          legalEntityId: parsed.data.legalEntityId ?? null,
          lineItems: { create: lineItemsCreateData },
        },
      }),
    ]);
    purchaseOrderIdResult = purchaseOrderId;
  } else {
    const [number, statusId] = await Promise.all([
      nextPurchaseOrderNumber(ctx.orgId),
      getDefaultStatusId(ctx.orgId, "PURCHASE_ORDER"),
    ]);
    const purchaseOrder = await prisma.purchaseOrder.create({
      data: {
        orgId: ctx.orgId,
        number,
        statusId,
        supplierId: parsed.data.supplierId,
        assignedEmployeeId: parsed.data.assignedEmployeeId,
        contractId: parsed.data.contractId ?? null,
        legalEntityId: parsed.data.legalEntityId ?? null,
        lineItems: { create: lineItemsCreateData },
      },
    });
    purchaseOrderIdResult = purchaseOrder.id;
    isNewPurchaseOrder = true;
  }

  if (input.customFieldValues) {
    await saveCustomFieldValuesRecord(ctx.orgId, "PURCHASE_ORDER", purchaseOrderIdResult, input.customFieldValues);
  }

  revalidatePath(`/${orgSlug}/purchase-orders`);
  revalidatePath(`/${orgSlug}/purchase-orders/${purchaseOrderIdResult}`);
  if (isNewPurchaseOrder) {
    dispatchWebhookEvent(ctx.orgId, "PURCHASE_ORDER_CREATED", { purchaseOrderId: purchaseOrderIdResult });
  }
  return { purchaseOrderId: purchaseOrderIdResult };
}

export async function updatePurchaseOrderStatus(
  orgSlug: string,
  purchaseOrderId: string,
  statusId: string,
) {
  const ctx = await getOrgContext(orgSlug);
  assertPermission(ctx, "purchaseOrders", "edit");
  await assertRowScope(ctx, "purchaseOrders", purchaseOrderId);

  const purchaseOrder = await prisma.purchaseOrder.findFirst({
    where: { id: purchaseOrderId, orgId: ctx.orgId },
    select: { statusId: true },
  });
  if (!purchaseOrder) {
    throw new Error("Заказ поставщику не найден");
  }

  const status = await prisma.documentStatus.findFirst({
    where: { id: statusId, orgId: ctx.orgId, kind: "PURCHASE_ORDER" },
  });
  if (!status) {
    throw new Error("Статус не найден");
  }

  if (statusId !== purchaseOrder.statusId) {
    const allowed = await getAllowedNextStatusIds(ctx.orgId, "PURCHASE_ORDER", purchaseOrder.statusId, {
      role: ctx.role,
      customRoleId: ctx.customRoleId,
      employeeId: ctx.employeeId,
    });
    if (!allowed.has(statusId)) {
      throw new Error("Такой переход между статусами запрещён");
    }
  }

  await prisma.purchaseOrder.update({
    where: { id: purchaseOrderId, orgId: ctx.orgId },
    data: { statusId },
  });
  dispatchWebhookEvent(ctx.orgId, "PURCHASE_ORDER_STATUS_CHANGED", { purchaseOrderId, statusId });

  revalidatePath(`/${orgSlug}/purchase-orders`);
  revalidatePath(`/${orgSlug}/purchase-orders/${purchaseOrderId}`);
}

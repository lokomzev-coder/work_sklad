"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getOrgContext } from "@/lib/tenant";
import { assertPermission } from "@/lib/permissions";
import { getDefaultStatusId } from "@/lib/document-statuses";
import { dispatchWebhookEvent } from "@/lib/webhooks";

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
  assertPermission(ctx.role, "orders", "edit");

  const parsed = upsertPurchaseOrderSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Неверные данные" };
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
  assertPermission(ctx.role, "orders", "edit");

  const status = await prisma.documentStatus.findFirst({
    where: { id: statusId, orgId: ctx.orgId, kind: "PURCHASE_ORDER" },
  });
  if (!status) {
    throw new Error("Статус не найден");
  }

  await prisma.purchaseOrder.update({
    where: { id: purchaseOrderId, orgId: ctx.orgId },
    data: { statusId },
  });
  dispatchWebhookEvent(ctx.orgId, "PURCHASE_ORDER_STATUS_CHANGED", { purchaseOrderId, statusId });

  revalidatePath(`/${orgSlug}/purchase-orders`);
  revalidatePath(`/${orgSlug}/purchase-orders/${purchaseOrderId}`);
}

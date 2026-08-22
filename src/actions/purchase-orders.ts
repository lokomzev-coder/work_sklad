"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getOrgContext } from "@/lib/tenant";
import { assertPermission } from "@/lib/permissions";
import type { PurchaseOrderStatus } from "@/generated/prisma/enums";

const lineItemSchema = z.object({
  catalogItemId: z.string().min(1),
  quantity: z.coerce.number().positive("Количество должно быть больше 0"),
  unitCost: z.coerce.number().min(0, "Цена не может быть отрицательной"),
});

const upsertPurchaseOrderSchema = z.object({
  supplierId: z.string().min(1).nullable(),
  assignedEmployeeId: z.string().min(1).nullable(),
  contractId: z.string().min(1).nullable().optional(),
  lineItems: z.array(lineItemSchema).min(1, "Добавьте хотя бы одну позицию"),
});

export interface UpsertPurchaseOrderInput {
  supplierId: string | null;
  assignedEmployeeId: string | null;
  contractId?: string | null;
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
  const catalogItemCount = await prisma.catalogItem.count({
    where: { id: { in: catalogItemIds }, orgId: ctx.orgId },
  });
  if (catalogItemCount !== catalogItemIds.length) {
    return { error: "Один из товаров/услуг не найден" };
  }

  if (parsed.data.contractId) {
    const contract = await prisma.contract.findFirst({
      where: { id: parsed.data.contractId, orgId: ctx.orgId },
    });
    if (!contract) {
      return { error: "Договор не найден" };
    }
  }

  const lineItemsCreateData = parsed.data.lineItems.map((li) => ({
    catalogItemId: li.catalogItemId,
    quantity: li.quantity,
    unitPriceSnapshot: li.unitCost,
  }));

  let purchaseOrderIdResult: string;

  if (purchaseOrderId) {
    await prisma.$transaction([
      prisma.purchaseOrderLineItem.deleteMany({ where: { purchaseOrderId } }),
      prisma.purchaseOrder.update({
        where: { id: purchaseOrderId, orgId: ctx.orgId },
        data: {
          supplierId: parsed.data.supplierId,
          assignedEmployeeId: parsed.data.assignedEmployeeId,
          contractId: parsed.data.contractId ?? null,
          lineItems: { create: lineItemsCreateData },
        },
      }),
    ]);
    purchaseOrderIdResult = purchaseOrderId;
  } else {
    const number = await nextPurchaseOrderNumber(ctx.orgId);
    const purchaseOrder = await prisma.purchaseOrder.create({
      data: {
        orgId: ctx.orgId,
        number,
        supplierId: parsed.data.supplierId,
        assignedEmployeeId: parsed.data.assignedEmployeeId,
        contractId: parsed.data.contractId ?? null,
        lineItems: { create: lineItemsCreateData },
      },
    });
    purchaseOrderIdResult = purchaseOrder.id;
  }

  revalidatePath(`/${orgSlug}/purchase-orders`);
  revalidatePath(`/${orgSlug}/purchase-orders/${purchaseOrderIdResult}`);
  return { purchaseOrderId: purchaseOrderIdResult };
}

export async function updatePurchaseOrderStatus(
  orgSlug: string,
  purchaseOrderId: string,
  status: PurchaseOrderStatus,
) {
  const ctx = await getOrgContext(orgSlug);
  assertPermission(ctx.role, "orders", "edit");

  await prisma.purchaseOrder.update({
    where: { id: purchaseOrderId, orgId: ctx.orgId },
    data: { status },
  });

  revalidatePath(`/${orgSlug}/purchase-orders`);
  revalidatePath(`/${orgSlug}/purchase-orders/${purchaseOrderId}`);
}

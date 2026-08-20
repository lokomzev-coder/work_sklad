"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getOrgContext } from "@/lib/tenant";
import { assertPermission } from "@/lib/permissions";
import type { OrderStatus } from "@/generated/prisma/enums";

const lineItemSchema = z.object({
  catalogItemId: z.string().min(1),
  quantity: z.coerce.number().positive("Количество должно быть больше 0"),
});

const upsertOrderSchema = z.object({
  clientId: z.string().min(1).nullable(),
  assignedEmployeeId: z.string().min(1).nullable(),
  lineItems: z.array(lineItemSchema).min(1, "Добавьте хотя бы одну позицию"),
});

export interface UpsertOrderInput {
  clientId: string | null;
  assignedEmployeeId: string | null;
  lineItems: { catalogItemId: string; quantity: number }[];
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

export async function upsertOrder(
  orgSlug: string,
  orderId: string | null,
  input: UpsertOrderInput,
): Promise<UpsertOrderResult> {
  const ctx = await getOrgContext(orgSlug);
  assertPermission(ctx.role, "orders", "edit");

  const parsed = upsertOrderSchema.safeParse(input);
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
  const priceById = new Map(catalogItems.map((c) => [c.id, c.unitPrice]));

  const lineItemsCreateData = parsed.data.lineItems.map((li) => ({
    catalogItemId: li.catalogItemId,
    quantity: li.quantity,
    // price is snapshotted at order time, so later catalog price edits
    // don't retroactively change already-placed orders
    unitPriceSnapshot: priceById.get(li.catalogItemId)!,
  }));

  let orderIdResult: string;

  if (orderId) {
    await prisma.$transaction([
      prisma.orderLineItem.deleteMany({ where: { orderId } }),
      prisma.order.update({
        where: { id: orderId, orgId: ctx.orgId },
        data: {
          clientId: parsed.data.clientId,
          assignedEmployeeId: parsed.data.assignedEmployeeId,
          lineItems: { create: lineItemsCreateData },
        },
      }),
    ]);
    orderIdResult = orderId;
  } else {
    // Low concurrency expected (single org admin creating orders); a
    // duplicate-number race is rare enough that we don't retry here.
    const number = await nextOrderNumber(ctx.orgId);
    const order = await prisma.order.create({
      data: {
        orgId: ctx.orgId,
        number,
        clientId: parsed.data.clientId,
        assignedEmployeeId: parsed.data.assignedEmployeeId,
        lineItems: { create: lineItemsCreateData },
      },
    });
    orderIdResult = order.id;
  }

  revalidatePath(`/${orgSlug}/orders`);
  revalidatePath(`/${orgSlug}/orders/${orderIdResult}`);
  return { orderId: orderIdResult };
}

export async function updateOrderStatus(
  orgSlug: string,
  orderId: string,
  status: OrderStatus,
) {
  const ctx = await getOrgContext(orgSlug);
  assertPermission(ctx.role, "orders", "edit");

  await prisma.order.update({
    where: { id: orderId, orgId: ctx.orgId },
    data: { status },
  });

  revalidatePath(`/${orgSlug}/orders`);
  revalidatePath(`/${orgSlug}/orders/${orderId}`);
}

"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getOrgContext } from "@/lib/tenant";
import { assertPermission } from "@/lib/permissions";

const lineSchema = z.object({
  catalogItemId: z.string().min(1),
  quantity: z.coerce.number().positive("Количество должно быть больше 0"),
});

const fulfillmentSchema = z.object({
  storeId: z.string().min(1, "Выберите склад"),
  comment: z
    .string()
    .trim()
    .max(500)
    .optional()
    .transform((v) => v || undefined),
  lines: z.array(lineSchema).min(1, "Добавьте хотя бы одну позицию"),
});

export interface FulfillmentInput {
  storeId: string;
  comment?: string;
  lines: { catalogItemId: string; quantity: number }[];
}

export interface FulfillmentResult {
  error?: string;
  movementId?: string;
}

async function nextMovementNumber(orgId: string): Promise<number> {
  const last = await prisma.stockMovement.findFirst({
    where: { orgId },
    orderBy: { number: "desc" },
    select: { number: true },
  });
  return (last?.number ?? 0) + 1;
}

/**
 * Ships against a customer Order (subtracts stock like LOSS, via the DEMAND
 * movement type). Requires every requested line to already be on the order,
 * and caps quantity at what hasn't been shipped yet — you can't demand more
 * than was ordered, and partial/multiple shipments against one order are
 * fine (each just eats into the remaining balance).
 */
export async function createDemand(
  orgSlug: string,
  orderId: string,
  input: FulfillmentInput,
): Promise<FulfillmentResult> {
  const ctx = await getOrgContext(orgSlug);
  assertPermission(ctx.role, "warehouse", "edit");

  const parsed = fulfillmentSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Неверные данные" };
  }
  const data = parsed.data;

  const order = await prisma.order.findFirst({
    where: { id: orderId, orgId: ctx.orgId },
    include: { lineItems: { include: { catalogItem: true } } },
  });
  if (!order) {
    return { error: "Заказ не найден" };
  }

  const store = await prisma.store.findFirst({
    where: { id: data.storeId, orgId: ctx.orgId, status: "ACTIVE" },
  });
  if (!store) {
    return { error: "Склад не найден или в архиве" };
  }

  const orderLineByItem = new Map(order.lineItems.map((li) => [li.catalogItemId, li]));

  const alreadyDemanded = await prisma.stockMovementLine.groupBy({
    by: ["catalogItemId"],
    where: { movement: { orderId, type: "DEMAND" } },
    _sum: { quantity: true },
  });
  const demandedByItem = new Map(
    alreadyDemanded.map((row) => [row.catalogItemId, Number(row._sum.quantity ?? 0)]),
  );

  const linesCreateData: { catalogItemId: string; quantity: number; unitPriceSnapshot: number }[] = [];
  for (const line of data.lines) {
    const orderLine = orderLineByItem.get(line.catalogItemId);
    if (!orderLine) {
      return { error: "Позиция не входит в состав заказа" };
    }
    if (orderLine.catalogItem.type !== "PRODUCT") {
      return { error: "Услуги и комплекты не участвуют в складском учёте" };
    }
    const alreadyShipped = demandedByItem.get(line.catalogItemId) ?? 0;
    const remaining = Number(orderLine.quantity) - alreadyShipped;
    if (line.quantity > remaining) {
      return {
        error: `Нельзя отгрузить больше, чем осталось по заказу (доступно: ${remaining})`,
      };
    }
    linesCreateData.push({
      catalogItemId: line.catalogItemId,
      quantity: line.quantity,
      unitPriceSnapshot: Number(orderLine.unitPriceSnapshot),
    });
  }

  const number = await nextMovementNumber(ctx.orgId);
  const movement = await prisma.stockMovement.create({
    data: {
      orgId: ctx.orgId,
      type: "DEMAND",
      number,
      storeId: data.storeId,
      orderId,
      comment: data.comment,
      lines: { create: linesCreateData },
    },
  });

  revalidatePath(`/${orgSlug}/orders/${orderId}`);
  revalidatePath(`/${orgSlug}/warehouse`);
  revalidatePath(`/${orgSlug}/warehouse/stock`);
  return { movementId: movement.id };
}

/**
 * Receives stock against a PurchaseOrder (adds stock like ENTER, via the
 * SUPPLY movement type). Same over-fulfillment guard as createDemand, mirrored
 * for the purchasing side.
 */
export async function createSupply(
  orgSlug: string,
  purchaseOrderId: string,
  input: FulfillmentInput,
): Promise<FulfillmentResult> {
  const ctx = await getOrgContext(orgSlug);
  assertPermission(ctx.role, "warehouse", "edit");

  const parsed = fulfillmentSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Неверные данные" };
  }
  const data = parsed.data;

  const purchaseOrder = await prisma.purchaseOrder.findFirst({
    where: { id: purchaseOrderId, orgId: ctx.orgId },
    include: { lineItems: { include: { catalogItem: true } } },
  });
  if (!purchaseOrder) {
    return { error: "Заказ поставщику не найден" };
  }

  const store = await prisma.store.findFirst({
    where: { id: data.storeId, orgId: ctx.orgId, status: "ACTIVE" },
  });
  if (!store) {
    return { error: "Склад не найден или в архиве" };
  }

  const poLineByItem = new Map(purchaseOrder.lineItems.map((li) => [li.catalogItemId, li]));

  const alreadySupplied = await prisma.stockMovementLine.groupBy({
    by: ["catalogItemId"],
    where: { movement: { purchaseOrderId, type: "SUPPLY" } },
    _sum: { quantity: true },
  });
  const suppliedByItem = new Map(
    alreadySupplied.map((row) => [row.catalogItemId, Number(row._sum.quantity ?? 0)]),
  );

  const linesCreateData: { catalogItemId: string; quantity: number; unitPriceSnapshot: number }[] = [];
  for (const line of data.lines) {
    const poLine = poLineByItem.get(line.catalogItemId);
    if (!poLine) {
      return { error: "Позиция не входит в состав заказа поставщику" };
    }
    if (poLine.catalogItem.type !== "PRODUCT") {
      return { error: "Услуги и комплекты не участвуют в складском учёте" };
    }
    const alreadyReceived = suppliedByItem.get(line.catalogItemId) ?? 0;
    const remaining = Number(poLine.quantity) - alreadyReceived;
    if (line.quantity > remaining) {
      return {
        error: `Нельзя принять больше, чем осталось по заказу (доступно: ${remaining})`,
      };
    }
    linesCreateData.push({
      catalogItemId: line.catalogItemId,
      quantity: line.quantity,
      unitPriceSnapshot: Number(poLine.unitPriceSnapshot),
    });
  }

  const number = await nextMovementNumber(ctx.orgId);
  const movement = await prisma.stockMovement.create({
    data: {
      orgId: ctx.orgId,
      type: "SUPPLY",
      number,
      storeId: data.storeId,
      purchaseOrderId,
      comment: data.comment,
      lines: { create: linesCreateData },
    },
  });

  revalidatePath(`/${orgSlug}/purchase-orders/${purchaseOrderId}`);
  revalidatePath(`/${orgSlug}/warehouse`);
  revalidatePath(`/${orgSlug}/warehouse/stock`);
  return { movementId: movement.id };
}

/**
 * Client returns goods from a previously-shipped Order (adds stock back like
 * ENTER, via SALES_RETURN). Capped at what was actually demanded minus what
 * was already returned — you can't return more than you shipped.
 */
export async function createSalesReturn(
  orgSlug: string,
  orderId: string,
  input: FulfillmentInput,
): Promise<FulfillmentResult> {
  const ctx = await getOrgContext(orgSlug);
  assertPermission(ctx.role, "warehouse", "edit");

  const parsed = fulfillmentSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Неверные данные" };
  }
  const data = parsed.data;

  const order = await prisma.order.findFirst({ where: { id: orderId, orgId: ctx.orgId } });
  if (!order) {
    return { error: "Заказ не найден" };
  }

  const store = await prisma.store.findFirst({
    where: { id: data.storeId, orgId: ctx.orgId, status: "ACTIVE" },
  });
  if (!store) {
    return { error: "Склад не найден или в архиве" };
  }

  const [demanded, returned] = await Promise.all([
    prisma.stockMovementLine.groupBy({
      by: ["catalogItemId"],
      where: { movement: { orderId, type: "DEMAND" } },
      _sum: { quantity: true, unitPriceSnapshot: true },
    }),
    prisma.stockMovementLine.groupBy({
      by: ["catalogItemId"],
      where: { movement: { orderId, type: "SALES_RETURN" } },
      _sum: { quantity: true },
    }),
  ]);
  const demandedByItem = new Map(demanded.map((row) => [row.catalogItemId, row]));
  const returnedByItem = new Map(
    returned.map((row) => [row.catalogItemId, Number(row._sum.quantity ?? 0)]),
  );

  const linesCreateData: { catalogItemId: string; quantity: number; unitPriceSnapshot: number }[] = [];
  for (const line of data.lines) {
    const demandRow = demandedByItem.get(line.catalogItemId);
    if (!demandRow) {
      return { error: "Эта позиция не отгружалась по данному заказу" };
    }
    const totalDemanded = Number(demandRow._sum.quantity ?? 0);
    const alreadyReturned = returnedByItem.get(line.catalogItemId) ?? 0;
    const remaining = totalDemanded - alreadyReturned;
    if (line.quantity > remaining) {
      return {
        error: `Нельзя вернуть больше, чем было отгружено (доступно: ${remaining})`,
      };
    }
    linesCreateData.push({
      catalogItemId: line.catalogItemId,
      quantity: line.quantity,
      unitPriceSnapshot: Number(demandRow._sum.unitPriceSnapshot ?? 0),
    });
  }

  const number = await nextMovementNumber(ctx.orgId);
  const movement = await prisma.stockMovement.create({
    data: {
      orgId: ctx.orgId,
      type: "SALES_RETURN",
      number,
      storeId: data.storeId,
      orderId,
      comment: data.comment,
      lines: { create: linesCreateData },
    },
  });

  revalidatePath(`/${orgSlug}/orders/${orderId}`);
  revalidatePath(`/${orgSlug}/warehouse`);
  revalidatePath(`/${orgSlug}/warehouse/stock`);
  return { movementId: movement.id };
}

/**
 * We return goods to a supplier from a previously-received PurchaseOrder
 * (subtracts stock like LOSS, via PURCHASE_RETURN). Capped at what was
 * actually received minus what was already returned.
 */
export async function createPurchaseReturn(
  orgSlug: string,
  purchaseOrderId: string,
  input: FulfillmentInput,
): Promise<FulfillmentResult> {
  const ctx = await getOrgContext(orgSlug);
  assertPermission(ctx.role, "warehouse", "edit");

  const parsed = fulfillmentSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Неверные данные" };
  }
  const data = parsed.data;

  const purchaseOrder = await prisma.purchaseOrder.findFirst({
    where: { id: purchaseOrderId, orgId: ctx.orgId },
  });
  if (!purchaseOrder) {
    return { error: "Заказ поставщику не найден" };
  }

  const store = await prisma.store.findFirst({
    where: { id: data.storeId, orgId: ctx.orgId, status: "ACTIVE" },
  });
  if (!store) {
    return { error: "Склад не найден или в архиве" };
  }

  const [supplied, returned] = await Promise.all([
    prisma.stockMovementLine.groupBy({
      by: ["catalogItemId"],
      where: { movement: { purchaseOrderId, type: "SUPPLY" } },
      _sum: { quantity: true, unitPriceSnapshot: true },
    }),
    prisma.stockMovementLine.groupBy({
      by: ["catalogItemId"],
      where: { movement: { purchaseOrderId, type: "PURCHASE_RETURN" } },
      _sum: { quantity: true },
    }),
  ]);
  const suppliedByItem = new Map(supplied.map((row) => [row.catalogItemId, row]));
  const returnedByItem = new Map(
    returned.map((row) => [row.catalogItemId, Number(row._sum.quantity ?? 0)]),
  );

  const linesCreateData: { catalogItemId: string; quantity: number; unitPriceSnapshot: number }[] = [];
  for (const line of data.lines) {
    const supplyRow = suppliedByItem.get(line.catalogItemId);
    if (!supplyRow) {
      return { error: "Эта позиция не принималась по данному заказу поставщику" };
    }
    const totalSupplied = Number(supplyRow._sum.quantity ?? 0);
    const alreadyReturned = returnedByItem.get(line.catalogItemId) ?? 0;
    const remaining = totalSupplied - alreadyReturned;
    if (line.quantity > remaining) {
      return {
        error: `Нельзя вернуть больше, чем было принято (доступно: ${remaining})`,
      };
    }
    linesCreateData.push({
      catalogItemId: line.catalogItemId,
      quantity: line.quantity,
      unitPriceSnapshot: Number(supplyRow._sum.unitPriceSnapshot ?? 0),
    });
  }

  const number = await nextMovementNumber(ctx.orgId);
  const movement = await prisma.stockMovement.create({
    data: {
      orgId: ctx.orgId,
      type: "PURCHASE_RETURN",
      number,
      storeId: data.storeId,
      purchaseOrderId,
      comment: data.comment,
      lines: { create: linesCreateData },
    },
  });

  revalidatePath(`/${orgSlug}/purchase-orders/${purchaseOrderId}`);
  revalidatePath(`/${orgSlug}/warehouse`);
  revalidatePath(`/${orgSlug}/warehouse/stock`);
  return { movementId: movement.id };
}

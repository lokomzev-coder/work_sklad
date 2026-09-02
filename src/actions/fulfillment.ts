"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getOrgContext } from "@/lib/tenant";
import { assertPermission } from "@/lib/permissions";
import { createBatchForSupplyLine, allocateFifo } from "@/lib/stock-batches";
import { getOrgBaseCurrency, getRateAt } from "@/lib/currency";

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
  assertPermission(ctx, "warehouse", "create");

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

  // Block M2: rate captured once per action call, at write time — not
  // re-fetched per report render (see lib/currency.ts::getRateAt).
  const baseCurrency = await getOrgBaseCurrency(ctx.orgId);
  const now = new Date();

  const linesCreateData: {
    catalogItemId: string;
    quantity: number;
    unitPriceSnapshot: number;
    currency: string;
    rateSnapshot: number | null;
  }[] = [];
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
    const rateSnapshot =
      orderLine.currency === baseCurrency ? null : await getRateAt(ctx.orgId, orderLine.currency, now);
    linesCreateData.push({
      catalogItemId: line.catalogItemId,
      quantity: line.quantity,
      unitPriceSnapshot: Number(orderLine.unitPriceSnapshot),
      currency: orderLine.currency,
      rateSnapshot,
    });
  }

  const number = await nextMovementNumber(ctx.orgId);
  // Block M1: transaction — the movement/lines and their FIFO batch
  // allocations must land atomically (a demand line without its cost
  // allocation, or vice versa, would corrupt P&L). `include: { lines: true }`
  // gets the generated line ids back so allocateFifo can attach to them.
  const movement = await prisma.$transaction(async (tx) => {
    const created = await tx.stockMovement.create({
      data: {
        orgId: ctx.orgId,
        type: "DEMAND",
        number,
        storeId: data.storeId,
        orderId,
        comment: data.comment,
        lines: { create: linesCreateData },
      },
      include: { lines: true },
    });
    for (const line of created.lines) {
      await allocateFifo(tx, {
        orgId: ctx.orgId,
        catalogItemId: line.catalogItemId,
        demandLineId: line.id,
        quantity: Number(line.quantity),
      });
    }
    return created;
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
  assertPermission(ctx, "warehouse", "create");

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

  // Block M2: rate captured once per action call, at write time.
  const baseCurrency = await getOrgBaseCurrency(ctx.orgId);
  const now = new Date();

  const linesCreateData: {
    catalogItemId: string;
    quantity: number;
    unitPriceSnapshot: number;
    currency: string;
    rateSnapshot: number | null;
  }[] = [];
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
    const rateSnapshot =
      poLine.currency === baseCurrency ? null : await getRateAt(ctx.orgId, poLine.currency, now);
    linesCreateData.push({
      catalogItemId: line.catalogItemId,
      quantity: line.quantity,
      unitPriceSnapshot: Number(poLine.unitPriceSnapshot),
      currency: poLine.currency,
      rateSnapshot,
    });
  }

  const number = await nextMovementNumber(ctx.orgId);
  // Block M1: transaction — each SUPPLY line needs a StockBatch created
  // atomically with it (a receipt line without its cost-basis batch would
  // silently fall back to "no batch" pricing for anything sold from it).
  const movement = await prisma.$transaction(async (tx) => {
    const created = await tx.stockMovement.create({
      data: {
        orgId: ctx.orgId,
        type: "SUPPLY",
        number,
        storeId: data.storeId,
        purchaseOrderId,
        comment: data.comment,
        lines: { create: linesCreateData },
      },
      include: { lines: true },
    });
    for (const line of created.lines) {
      await createBatchForSupplyLine(tx, {
        orgId: ctx.orgId,
        catalogItemId: line.catalogItemId,
        sourceMovementLineId: line.id,
        unitCost: Number(line.unitPriceSnapshot ?? 0),
        currency: line.currency,
        rateSnapshot: line.rateSnapshot ? Number(line.rateSnapshot) : null,
        quantity: Number(line.quantity),
      });
    }
    return created;
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
  assertPermission(ctx, "warehouse", "create");

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

  const [demanded, returned, catalogItems] = await Promise.all([
    prisma.stockMovementLine.groupBy({
      by: ["catalogItemId"],
      where: { movement: { orderId, type: "DEMAND" } },
      _sum: { quantity: true, unitPriceSnapshot: true, rateSnapshot: true },
    }),
    prisma.stockMovementLine.groupBy({
      by: ["catalogItemId"],
      where: { movement: { orderId, type: "SALES_RETURN" } },
      _sum: { quantity: true },
    }),
    prisma.catalogItem.findMany({
      where: { id: { in: data.lines.map((l) => l.catalogItemId) } },
      select: { id: true, currency: true },
    }),
  ]);
  const demandedByItem = new Map(demanded.map((row) => [row.catalogItemId, row]));
  const returnedByItem = new Map(
    returned.map((row) => [row.catalogItemId, Number(row._sum.quantity ?? 0)]),
  );
  const currencyByItem = new Map(catalogItems.map((c) => [c.id, c.currency]));

  // Block M2: a return reverses the original DEMAND at the rate it was
  // originally booked at (via the aggregated _sum, same as unitPriceSnapshot
  // below), not a fresh rate at return time — a return should undo exactly
  // what was recorded, not re-price it.
  const linesCreateData: {
    catalogItemId: string;
    quantity: number;
    unitPriceSnapshot: number;
    currency: string | null;
    rateSnapshot: number | null;
  }[] = [];
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
      currency: currencyByItem.get(line.catalogItemId) ?? null,
      rateSnapshot: demandRow._sum.rateSnapshot ? Number(demandRow._sum.rateSnapshot) : null,
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
  assertPermission(ctx, "warehouse", "create");

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

  const [supplied, returned, catalogItems] = await Promise.all([
    prisma.stockMovementLine.groupBy({
      by: ["catalogItemId"],
      where: { movement: { purchaseOrderId, type: "SUPPLY" } },
      _sum: { quantity: true, unitPriceSnapshot: true, rateSnapshot: true },
    }),
    prisma.stockMovementLine.groupBy({
      by: ["catalogItemId"],
      where: { movement: { purchaseOrderId, type: "PURCHASE_RETURN" } },
      _sum: { quantity: true },
    }),
    prisma.catalogItem.findMany({
      where: { id: { in: data.lines.map((l) => l.catalogItemId) } },
      select: { id: true, currency: true },
    }),
  ]);
  const suppliedByItem = new Map(supplied.map((row) => [row.catalogItemId, row]));
  const returnedByItem = new Map(
    returned.map((row) => [row.catalogItemId, Number(row._sum.quantity ?? 0)]),
  );
  const currencyByItem = new Map(catalogItems.map((c) => [c.id, c.currency]));

  // Block M2: reverses the original SUPPLY at the rate it was originally
  // booked at (see createSalesReturn's comment above for the reasoning).
  const linesCreateData: {
    catalogItemId: string;
    quantity: number;
    unitPriceSnapshot: number;
    currency: string | null;
    rateSnapshot: number | null;
  }[] = [];
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
      currency: currencyByItem.get(line.catalogItemId) ?? null,
      rateSnapshot: supplyRow._sum.rateSnapshot ? Number(supplyRow._sum.rateSnapshot) : null,
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

"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getOrgContext, type OrgContext } from "@/lib/tenant";
import { assertPermission } from "@/lib/permissions";
import { createBatchForSupplyLine, allocateFifo } from "@/lib/stock-batches";
import { getOrgBaseCurrency, getRateAt } from "@/lib/currency";
import { lineKey, syncOrderReservations, getOrderRemainingByKey } from "@/lib/orders";
import { getReservedQuantitiesByStore, getItemBalanceAtStore } from "@/lib/stock";

const lineSchema = z.object({
  catalogItemId: z.string().min(1),
  variantId: z.string().min(1).nullable().optional(),
  quantity: z.coerce.number().positive("Количество должно быть больше 0"),
  // Block O phase 8 — only meaningful for createSupply (the only flow that
  // creates a StockBatch at all, see its own comment); harmlessly unused by
  // every other fulfillment flow sharing this same schema.
  batchLabel: z
    .string()
    .trim()
    .max(100)
    .optional()
    .transform((v) => v || undefined),
  batchExpiryDate: z
    .string()
    .trim()
    .optional()
    .transform((v) => v || undefined),
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
  lines: {
    catalogItemId: string;
    variantId?: string | null;
    quantity: number;
    batchLabel?: string;
    batchExpiryDate?: string;
  }[];
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

export interface CreateDraftDemandResult {
  error?: string;
}

export type CreateDraftDemandRecordResult = { error: string } | { movementId: string };

/**
 * Core of `createDraftDemand` below, minus the `redirect()` — factored out
 * (Block K remainder, phase 7) so "Волна отбора" can create a draft per
 * order in a loop (`createDraftDemandsForWave`, actions/picking-waves.ts)
 * without each iteration throwing a navigation. `createDraftDemand` itself
 * is unchanged in behavior/signature — its one existing caller
 * (`create-document-menu.tsx`) needs nothing different.
 */
export async function createDraftDemandRecord(
  ctx: OrgContext,
  orderId: string,
): Promise<CreateDraftDemandRecordResult> {
  const order = await prisma.order.findFirst({ where: { id: orderId, orgId: ctx.orgId } });
  if (!order) {
    return { error: "Заказ не найден" };
  }
  if (!ctx.defaultStoreId) {
    return { error: "Обратитесь к администратору: не назначена точка продаж по умолчанию" };
  }
  const store = await prisma.store.findFirst({
    where: { id: ctx.defaultStoreId, orgId: ctx.orgId, status: "ACTIVE" },
  });
  if (!store) {
    return { error: "Склад по умолчанию не найден или в архиве — обратитесь к администратору" };
  }

  const remainingByKey = await getOrderRemainingByKey(prisma, orderId);
  const remainingLines = [...remainingByKey.values()].filter((l) => l.quantity > 0);
  if (remainingLines.length === 0) {
    return { error: "Нечего отгружать — всё уже отгружено" };
  }

  const orderLineItems = await prisma.orderLineItem.findMany({ where: { orderId } });
  const orderLineByKey = new Map(orderLineItems.map((li) => [lineKey(li.catalogItemId, li.variantId), li]));

  const baseCurrency = await getOrgBaseCurrency(ctx.orgId);
  const now = new Date();
  const linesCreateData: {
    catalogItemId: string;
    variantId: string | null;
    quantity: number;
    unitPriceSnapshot: number;
    currency: string;
    rateSnapshot: number | null;
  }[] = [];
  for (const line of remainingLines) {
    const orderLine = orderLineByKey.get(lineKey(line.catalogItemId, line.variantId))!;
    const rateSnapshot =
      orderLine.currency === baseCurrency ? null : await getRateAt(ctx.orgId, orderLine.currency, now);
    linesCreateData.push({
      catalogItemId: line.catalogItemId,
      variantId: line.variantId,
      quantity: line.quantity,
      unitPriceSnapshot: Number(orderLine.unitPriceSnapshot),
      currency: orderLine.currency,
      rateSnapshot,
    });
  }

  const number = await nextMovementNumber(ctx.orgId);
  const movement = await prisma.stockMovement.create({
    data: {
      orgId: ctx.orgId,
      type: "DEMAND",
      number,
      storeId: ctx.defaultStoreId,
      orderId,
      isPosted: false,
      lines: { create: linesCreateData },
    },
  });

  return { movementId: movement.id };
}

/**
 * "Создать документ" → "Отгрузка" (МойСклад model): creates a DRAFT DEMAND
 * movement — all remaining ordered-but-not-yet-posted-shipped quantities,
 * store defaulted to the acting employee's own `defaultStoreId` — with zero
 * stock/FIFO/reservation effect (see the `isPosted: true` filters added to
 * lib/stock.ts::getStockBalances, lib/orders.ts, lib/reports.ts; a draft's
 * lines simply don't count anywhere yet). Redirects straight to the new
 * document's own page, same pattern as
 * actions/invoices-out.ts::createInvoiceFromOrder — store/quantities are
 * edited there, then `postDraftDemand` below performs the actual deduction.
 * Supersedes the old create-and-post-atomically `createDemand` (removed —
 * its only caller, `FulfillmentPanel kind="demand"` on the order page, is
 * gone too).
 */
export async function createDraftDemand(orgSlug: string, orderId: string): Promise<CreateDraftDemandResult> {
  const ctx = await getOrgContext(orgSlug);
  assertPermission(ctx, "warehouse", "create");

  const result = await createDraftDemandRecord(ctx, orderId);
  if ("error" in result) {
    return result;
  }

  revalidatePath(`/${orgSlug}/orders/${orderId}`);
  redirect(`/${orgSlug}/warehouse/${result.movementId}`);
}

const postDraftDemandSchema = z.object({
  storeId: z.string().min(1, "Выберите склад"),
  lines: z.array(
    z.object({
      catalogItemId: z.string().min(1),
      variantId: z.string().min(1).nullable().optional(),
      quantity: z.coerce.number().min(0),
    }),
  ),
});

export interface PostDraftDemandInput {
  storeId: string;
  lines: { catalogItemId: string; variantId?: string | null; quantity: number }[];
}

export interface PostDraftDemandResult {
  error?: string;
}

/**
 * Finalizes a draft DEMAND movement created by `createDraftDemand` — applies
 * the (possibly store already-edited, quantities already-edited) final
 * values, re-validates the same two caps `createDemand` used to check at
 * creation time (over-fulfillment vs. order qty, availability vs. other
 * orders' reservations — state may have moved since the draft was created),
 * then atomically: replaces the movement's lines wholesale (same idiom as
 * `OrderLineItem`/`StockReservation`), marks it posted, runs `allocateFifo`
 * per line, and resyncs the order's reservation. A quantity of 0 for a line
 * means "don't ship this line" — it's simply dropped, not an error.
 */
export async function postDraftDemand(
  orgSlug: string,
  movementId: string,
  input: PostDraftDemandInput,
): Promise<PostDraftDemandResult> {
  const ctx = await getOrgContext(orgSlug);
  assertPermission(ctx, "warehouse", "edit");

  const parsed = postDraftDemandSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Неверные данные" };
  }
  const data = parsed.data;

  const movement = await prisma.stockMovement.findFirst({ where: { id: movementId, orgId: ctx.orgId } });
  if (!movement) {
    return { error: "Документ не найден" };
  }
  if (movement.type !== "DEMAND") {
    return { error: "Проведение поддерживается только для отгрузок" };
  }
  if (movement.isPosted) {
    return { error: "Документ уже проведён" };
  }
  if (!movement.orderId) {
    return { error: "У документа не привязан заказ" };
  }
  const orderId = movement.orderId;

  const store = await prisma.store.findFirst({
    where: { id: data.storeId, orgId: ctx.orgId, status: "ACTIVE" },
  });
  if (!store) {
    return { error: "Склад не найден или в архиве" };
  }

  const order = await prisma.order.findFirst({
    where: { id: orderId, orgId: ctx.orgId },
    include: { lineItems: { include: { catalogItem: true } } },
  });
  if (!order) {
    return { error: "Заказ не найден" };
  }
  const orderLineByKey = new Map(order.lineItems.map((li) => [lineKey(li.catalogItemId, li.variantId), li]));

  // Excludes this still-unposted draft automatically (isPosted: true filter).
  const remainingByKey = await getOrderRemainingByKey(prisma, orderId);
  const reservedByOthers = await getReservedQuantitiesByStore(ctx.orgId, data.storeId, orderId);
  const baseCurrency = await getOrgBaseCurrency(ctx.orgId);
  const now = new Date();

  const linesCreateData: {
    catalogItemId: string;
    variantId: string | null;
    quantity: number;
    unitPriceSnapshot: number;
    currency: string;
    rateSnapshot: number | null;
  }[] = [];
  for (const line of data.lines) {
    if (line.quantity <= 0) continue;
    const variantId = line.variantId ?? null;
    const key = lineKey(line.catalogItemId, variantId);
    const orderLine = orderLineByKey.get(key);
    if (!orderLine) {
      return { error: "Позиция не входит в состав заказа" };
    }
    const remaining = remainingByKey.get(key)?.quantity ?? 0;
    if (line.quantity > remaining) {
      return {
        error: `Нельзя отгрузить больше, чем осталось по заказу (доступно: ${remaining})`,
      };
    }
    const physicalBalance = await getItemBalanceAtStore(ctx.orgId, data.storeId, line.catalogItemId, variantId);
    const reserved = reservedByOthers.get(key) ?? 0;
    const availableToShip = Math.max(0, physicalBalance - reserved);
    if (line.quantity > availableToShip) {
      return {
        error: `Недостаточно свободного остатка (доступно: ${availableToShip}, часть зарезервирована другими заказами)`,
      };
    }
    const rateSnapshot =
      orderLine.currency === baseCurrency ? null : await getRateAt(ctx.orgId, orderLine.currency, now);
    linesCreateData.push({
      catalogItemId: line.catalogItemId,
      variantId,
      quantity: line.quantity,
      unitPriceSnapshot: Number(orderLine.unitPriceSnapshot),
      currency: orderLine.currency,
      rateSnapshot,
    });
  }
  if (linesCreateData.length === 0) {
    return { error: "Укажите количество хотя бы для одной позиции" };
  }

  await prisma.$transaction(async (tx) => {
    await tx.stockMovementLine.deleteMany({ where: { movementId } });
    const updated = await tx.stockMovement.update({
      where: { id: movementId },
      data: {
        storeId: data.storeId,
        isPosted: true,
        postedAt: now,
        lines: { create: linesCreateData },
      },
      include: { lines: true },
    });
    for (const line of updated.lines) {
      await allocateFifo(tx, {
        orgId: ctx.orgId,
        catalogItemId: line.catalogItemId,
        variantId: line.variantId,
        demandLineId: line.id,
        quantity: Number(line.quantity),
      });
    }
    await syncOrderReservations(tx, ctx.orgId, orderId);
  });

  revalidatePath(`/${orgSlug}/warehouse/${movementId}`);
  revalidatePath(`/${orgSlug}/warehouse`);
  revalidatePath(`/${orgSlug}/warehouse/stock`);
  revalidatePath(`/${orgSlug}/orders/${orderId}`);
  return {};
}

export interface CreateDraftMoveResult {
  error?: string;
}

/**
 * "Создать документ" → "Перемещение" (МойСклад model): creates a DRAFT MOVE
 * movement, same draft/posted idiom as `createDraftDemand` above — remaining
 * ordered-but-not-yet-shipped quantities, source store defaulted to the
 * acting employee's `defaultStoreId`, destination store picked later on the
 * draft's own page (`postDraftMove`). Unlike DEMAND, a MOVE has no FIFO/
 * reservation effect at all even once posted (see stock-movements.ts's plain
 * `createStockMovement` — MOVE just relocates stock between two stores,
 * lib/stock.ts's balance aggregation handles the store-to-store accounting
 * on its own), so isPosted here is only a "don't count this draft's lines
 * anywhere yet" flag, not a gate on any allocation logic.
 */
export async function createDraftMoveFromOrder(orgSlug: string, orderId: string): Promise<CreateDraftMoveResult> {
  const ctx = await getOrgContext(orgSlug);
  assertPermission(ctx, "warehouse", "create");

  const order = await prisma.order.findFirst({ where: { id: orderId, orgId: ctx.orgId } });
  if (!order) {
    return { error: "Заказ не найден" };
  }
  if (!ctx.defaultStoreId) {
    return { error: "Обратитесь к администратору: не назначена точка продаж по умолчанию" };
  }
  const store = await prisma.store.findFirst({
    where: { id: ctx.defaultStoreId, orgId: ctx.orgId, status: "ACTIVE" },
  });
  if (!store) {
    return { error: "Склад по умолчанию не найден или в архиве — обратитесь к администратору" };
  }

  const remainingByKey = await getOrderRemainingByKey(prisma, orderId);
  const remainingLines = [...remainingByKey.values()].filter((l) => l.quantity > 0);
  if (remainingLines.length === 0) {
    return { error: "Нечего перемещать — всё уже отгружено" };
  }

  const orderLineItems = await prisma.orderLineItem.findMany({ where: { orderId } });
  const orderLineByKey = new Map(orderLineItems.map((li) => [lineKey(li.catalogItemId, li.variantId), li]));

  const linesCreateData: { catalogItemId: string; variantId: string | null; quantity: number }[] = [];
  for (const line of remainingLines) {
    const orderLine = orderLineByKey.get(lineKey(line.catalogItemId, line.variantId))!;
    linesCreateData.push({
      catalogItemId: orderLine.catalogItemId,
      variantId: orderLine.variantId,
      quantity: line.quantity,
    });
  }

  const number = await nextMovementNumber(ctx.orgId);
  const movement = await prisma.stockMovement.create({
    data: {
      orgId: ctx.orgId,
      type: "MOVE",
      number,
      storeId: ctx.defaultStoreId,
      orderId,
      isPosted: false,
      lines: { create: linesCreateData },
    },
  });

  revalidatePath(`/${orgSlug}/orders/${orderId}`);
  redirect(`/${orgSlug}/warehouse/${movement.id}`);
}

const postDraftMoveSchema = z.object({
  storeId: z.string().min(1, "Выберите склад"),
  toStoreId: z.string().min(1, "Выберите склад назначения"),
  lines: z.array(
    z.object({
      catalogItemId: z.string().min(1),
      variantId: z.string().min(1).nullable().optional(),
      quantity: z.coerce.number().min(0),
    }),
  ),
});

export interface PostDraftMoveInput {
  storeId: string;
  toStoreId: string;
  lines: { catalogItemId: string; variantId?: string | null; quantity: number }[];
}

export interface PostDraftMoveResult {
  error?: string;
}

/**
 * Finalizes a draft MOVE movement created by `createDraftMoveFromOrder` —
 * same re-validation-at-post-time idiom as `postDraftDemand` (state may have
 * moved since the draft was created), but simpler: no FIFO allocation, no
 * reservation resync (MOVE doesn't touch either). Caps quantities at what's
 * still remaining on the order AND at what's physically on hand at the
 * source store — the plain manual MOVE form (stock-movements.ts) doesn't
 * check the latter (a pre-existing, separate gap, out of scope here), but an
 * order-linked flow should not silently let a movement go negative.
 */
export async function postDraftMove(
  orgSlug: string,
  movementId: string,
  input: PostDraftMoveInput,
): Promise<PostDraftMoveResult> {
  const ctx = await getOrgContext(orgSlug);
  assertPermission(ctx, "warehouse", "edit");

  const parsed = postDraftMoveSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Неверные данные" };
  }
  const data = parsed.data;
  if (data.toStoreId === data.storeId) {
    return { error: "Склад назначения должен отличаться от исходного" };
  }

  const movement = await prisma.stockMovement.findFirst({ where: { id: movementId, orgId: ctx.orgId } });
  if (!movement) {
    return { error: "Документ не найден" };
  }
  if (movement.type !== "MOVE") {
    return { error: "Проведение поддерживается только для перемещений" };
  }
  if (movement.isPosted) {
    return { error: "Документ уже проведён" };
  }
  if (!movement.orderId) {
    return { error: "У документа не привязан заказ" };
  }
  const orderId = movement.orderId;

  const stores = await prisma.store.findMany({
    where: { id: { in: [data.storeId, data.toStoreId] }, orgId: ctx.orgId, status: "ACTIVE" },
  });
  if (stores.length !== 2) {
    return { error: "Один из складов не найден или в архиве" };
  }

  const order = await prisma.order.findFirst({ where: { id: orderId, orgId: ctx.orgId } });
  if (!order) {
    return { error: "Заказ не найден" };
  }

  // Excludes this still-unposted draft automatically (isPosted: true filter).
  const remainingByKey = await getOrderRemainingByKey(prisma, orderId);

  const linesCreateData: { catalogItemId: string; variantId: string | null; quantity: number }[] = [];
  for (const line of data.lines) {
    if (line.quantity <= 0) continue;
    const variantId = line.variantId ?? null;
    const key = lineKey(line.catalogItemId, variantId);
    const remaining = remainingByKey.get(key)?.quantity ?? 0;
    if (line.quantity > remaining) {
      return {
        error: `Нельзя переместить больше, чем осталось по заказу (доступно: ${remaining})`,
      };
    }
    const physicalBalance = await getItemBalanceAtStore(ctx.orgId, data.storeId, line.catalogItemId, variantId);
    if (line.quantity > physicalBalance) {
      return {
        error: `Недостаточно остатка на исходном складе (доступно: ${physicalBalance})`,
      };
    }
    linesCreateData.push({ catalogItemId: line.catalogItemId, variantId, quantity: line.quantity });
  }
  if (linesCreateData.length === 0) {
    return { error: "Укажите количество хотя бы для одной позиции" };
  }

  await prisma.$transaction(async (tx) => {
    await tx.stockMovementLine.deleteMany({ where: { movementId } });
    await tx.stockMovement.update({
      where: { id: movementId },
      data: {
        storeId: data.storeId,
        toStoreId: data.toStoreId,
        isPosted: true,
        postedAt: new Date(),
        lines: { create: linesCreateData },
      },
    });
  });

  revalidatePath(`/${orgSlug}/warehouse/${movementId}`);
  revalidatePath(`/${orgSlug}/warehouse`);
  revalidatePath(`/${orgSlug}/warehouse/stock`);
  revalidatePath(`/${orgSlug}/orders/${orderId}`);
  return {};
}

interface PurchaseOrderRemainingLine {
  catalogItemId: string;
  variantId: string | null;
  quantity: number;
}

/**
 * Same idiom as `getOrderRemainingByKey` (lib/orders.ts), mirrored for the
 * purchasing side — "how much of this PO is still unreceived", excluding
 * this-still-unposted draft automatically (isPosted: true filter).
 */
async function getPurchaseOrderRemainingByKey(
  orgId: string,
  purchaseOrderId: string,
): Promise<Map<string, PurchaseOrderRemainingLine>> {
  const purchaseOrder = await prisma.purchaseOrder.findFirstOrThrow({
    where: { id: purchaseOrderId, orgId },
    include: { lineItems: { include: { catalogItem: true } } },
  });
  const supplied = await prisma.stockMovementLine.groupBy({
    by: ["catalogItemId", "variantId"],
    where: { movement: { purchaseOrderId, type: "SUPPLY", isPosted: true } },
    _sum: { quantity: true },
  });
  const suppliedByKey = new Map(
    supplied.map((row) => [lineKey(row.catalogItemId, row.variantId), Number(row._sum.quantity ?? 0)]),
  );

  const result = new Map<string, PurchaseOrderRemainingLine>();
  for (const li of purchaseOrder.lineItems) {
    if (li.catalogItem.type !== "PRODUCT") continue;
    const key = lineKey(li.catalogItemId, li.variantId);
    const received = suppliedByKey.get(key) ?? 0;
    result.set(key, {
      catalogItemId: li.catalogItemId,
      variantId: li.variantId,
      quantity: Math.max(0, Number(li.quantity) - received),
    });
  }
  return result;
}

export interface CreateDraftSupplyResult {
  error?: string;
}

/**
 * "Приёмка" — Block K remainder: converts the PurchaseOrder side to the same
 * draft/posted idiom `createDraftDemand`/`postDraftDemand` already use on
 * the sales side, superseding the old create-and-post-atomically
 * `createSupply` the same way `createDemand` was superseded (see
 * `FulfillmentPanel`'s own comment — "supply" removed from its kinds, its
 * only remaining caller). No StockBatch is created here — batches only
 * exist for POSTED receipts (a batch backs FIFO cost-basis for stock that's
 * actually in the warehouse), so batch creation moves entirely into
 * `postDraftSupply` below.
 */
export async function createDraftSupply(orgSlug: string, purchaseOrderId: string): Promise<CreateDraftSupplyResult> {
  const ctx = await getOrgContext(orgSlug);
  assertPermission(ctx, "warehouse", "create");

  const purchaseOrder = await prisma.purchaseOrder.findFirst({ where: { id: purchaseOrderId, orgId: ctx.orgId } });
  if (!purchaseOrder) {
    return { error: "Заказ поставщику не найден" };
  }
  if (!ctx.defaultStoreId) {
    return { error: "Обратитесь к администратору: не назначена точка продаж по умолчанию" };
  }
  const store = await prisma.store.findFirst({
    where: { id: ctx.defaultStoreId, orgId: ctx.orgId, status: "ACTIVE" },
  });
  if (!store) {
    return { error: "Склад по умолчанию не найден или в архиве — обратитесь к администратору" };
  }

  const remainingByKey = await getPurchaseOrderRemainingByKey(ctx.orgId, purchaseOrderId);
  const remainingLines = [...remainingByKey.values()].filter((l) => l.quantity > 0);
  if (remainingLines.length === 0) {
    return { error: "Нечего принимать — всё уже принято" };
  }

  const number = await nextMovementNumber(ctx.orgId);
  const movement = await prisma.stockMovement.create({
    data: {
      orgId: ctx.orgId,
      type: "SUPPLY",
      number,
      storeId: ctx.defaultStoreId,
      purchaseOrderId,
      isPosted: false,
      lines: {
        create: remainingLines.map((l) => ({
          catalogItemId: l.catalogItemId,
          variantId: l.variantId,
          quantity: l.quantity,
        })),
      },
    },
  });

  revalidatePath(`/${orgSlug}/purchase-orders/${purchaseOrderId}`);
  redirect(`/${orgSlug}/warehouse/${movement.id}`);
}

const postDraftSupplyLineSchema = z.object({
  catalogItemId: z.string().min(1),
  variantId: z.string().min(1).nullable().optional(),
  quantity: z.coerce.number().min(0),
  batchLabel: z
    .string()
    .trim()
    .max(100)
    .optional()
    .transform((v) => v || undefined),
  batchExpiryDate: z
    .string()
    .trim()
    .optional()
    .transform((v) => v || undefined),
});

const postDraftSupplySchema = z.object({
  storeId: z.string().min(1, "Выберите склад"),
  lines: z.array(postDraftSupplyLineSchema),
});

export interface PostDraftSupplyInput {
  storeId: string;
  lines: {
    catalogItemId: string;
    variantId?: string | null;
    quantity: number;
    batchLabel?: string;
    batchExpiryDate?: string;
  }[];
}

export interface PostDraftSupplyResult {
  error?: string;
}

/**
 * Finalizes a draft SUPPLY movement created by `createDraftSupply` — same
 * re-validation-at-post-time idiom as `postDraftDemand` (state may have
 * moved since the draft was created), then atomically replaces the
 * movement's lines wholesale, marks it posted, and creates a StockBatch per
 * line (same `createBatchForSupplyLine` call the old atomic `createSupply`
 * made, just moved here — a receipt line without its cost-basis batch would
 * silently fall back to "no batch" pricing for anything sold from it).
 */
export async function postDraftSupply(
  orgSlug: string,
  movementId: string,
  input: PostDraftSupplyInput,
): Promise<PostDraftSupplyResult> {
  const ctx = await getOrgContext(orgSlug);
  assertPermission(ctx, "warehouse", "edit");

  const parsed = postDraftSupplySchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Неверные данные" };
  }
  const data = parsed.data;

  const movement = await prisma.stockMovement.findFirst({ where: { id: movementId, orgId: ctx.orgId } });
  if (!movement) {
    return { error: "Документ не найден" };
  }
  if (movement.type !== "SUPPLY") {
    return { error: "Проведение поддерживается только для приёмок" };
  }
  if (movement.isPosted) {
    return { error: "Документ уже проведён" };
  }
  if (!movement.purchaseOrderId) {
    return { error: "У документа не привязан заказ поставщику" };
  }
  const purchaseOrderId = movement.purchaseOrderId;

  const store = await prisma.store.findFirst({
    where: { id: data.storeId, orgId: ctx.orgId, status: "ACTIVE" },
  });
  if (!store) {
    return { error: "Склад не найден или в архиве" };
  }

  const purchaseOrder = await prisma.purchaseOrder.findFirst({
    where: { id: purchaseOrderId, orgId: ctx.orgId },
    include: { lineItems: { include: { catalogItem: true } } },
  });
  if (!purchaseOrder) {
    return { error: "Заказ поставщику не найден" };
  }
  const poLineByKey = new Map(purchaseOrder.lineItems.map((li) => [lineKey(li.catalogItemId, li.variantId), li]));

  // Excludes this still-unposted draft automatically (isPosted: true filter).
  const remainingByKey = await getPurchaseOrderRemainingByKey(ctx.orgId, purchaseOrderId);
  const baseCurrency = await getOrgBaseCurrency(ctx.orgId);
  const now = new Date();

  const linesCreateData: {
    catalogItemId: string;
    variantId: string | null;
    quantity: number;
    unitPriceSnapshot: number;
    currency: string;
    rateSnapshot: number | null;
  }[] = [];
  const batchInfoByKey = new Map<string, { label?: string; expiryDate?: Date }>();
  for (const line of data.lines) {
    if (line.quantity <= 0) continue;
    const variantId = line.variantId ?? null;
    const key = lineKey(line.catalogItemId, variantId);
    const poLine = poLineByKey.get(key);
    if (!poLine) {
      return { error: "Позиция не входит в состав заказа поставщику" };
    }
    if (poLine.catalogItem.type !== "PRODUCT") {
      return { error: "Услуги и комплекты не участвуют в складском учёте" };
    }
    const remaining = remainingByKey.get(key)?.quantity ?? 0;
    if (line.quantity > remaining) {
      return {
        error: `Нельзя принять больше, чем осталось по заказу (доступно: ${remaining})`,
      };
    }
    batchInfoByKey.set(key, {
      label: line.batchLabel,
      expiryDate: line.batchExpiryDate ? new Date(line.batchExpiryDate) : undefined,
    });
    const rateSnapshot =
      poLine.currency === baseCurrency ? null : await getRateAt(ctx.orgId, poLine.currency, now);
    linesCreateData.push({
      catalogItemId: line.catalogItemId,
      variantId,
      quantity: line.quantity,
      unitPriceSnapshot: Number(poLine.unitPriceSnapshot),
      currency: poLine.currency,
      rateSnapshot,
    });
  }
  if (linesCreateData.length === 0) {
    return { error: "Укажите количество хотя бы для одной позиции" };
  }

  // Block M1: transaction — each SUPPLY line needs a StockBatch created
  // atomically with it, same as the old atomic createSupply did.
  await prisma.$transaction(async (tx) => {
    await tx.stockMovementLine.deleteMany({ where: { movementId } });
    const updated = await tx.stockMovement.update({
      where: { id: movementId },
      data: {
        storeId: data.storeId,
        isPosted: true,
        postedAt: now,
        lines: { create: linesCreateData },
      },
      include: { lines: true },
    });
    for (const line of updated.lines) {
      const batchInfo = batchInfoByKey.get(lineKey(line.catalogItemId, line.variantId));
      await createBatchForSupplyLine(tx, {
        orgId: ctx.orgId,
        catalogItemId: line.catalogItemId,
        variantId: line.variantId,
        sourceMovementLineId: line.id,
        unitCost: Number(line.unitPriceSnapshot ?? 0),
        currency: line.currency,
        rateSnapshot: line.rateSnapshot ? Number(line.rateSnapshot) : null,
        quantity: Number(line.quantity),
        label: batchInfo?.label,
        expiryDate: batchInfo?.expiryDate,
      });
    }
  });

  revalidatePath(`/${orgSlug}/warehouse/${movementId}`);
  revalidatePath(`/${orgSlug}/warehouse`);
  revalidatePath(`/${orgSlug}/warehouse/stock`);
  revalidatePath(`/${orgSlug}/purchase-orders/${purchaseOrderId}`);
  return {};
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
      by: ["catalogItemId", "variantId"],
      // "Создать документ" flow: a draft (unposted) DEMAND hasn't actually
      // shipped anything — can't return against it.
      where: { movement: { orderId, type: "DEMAND", isPosted: true } },
      _sum: { quantity: true, unitPriceSnapshot: true, rateSnapshot: true },
    }),
    prisma.stockMovementLine.groupBy({
      by: ["catalogItemId", "variantId"],
      where: { movement: { orderId, type: "SALES_RETURN" } },
      _sum: { quantity: true },
    }),
    prisma.catalogItem.findMany({
      where: { id: { in: data.lines.map((l) => l.catalogItemId) } },
      select: { id: true, currency: true },
    }),
  ]);
  const demandedByKey = new Map(demanded.map((row) => [lineKey(row.catalogItemId, row.variantId), row]));
  const returnedByKey = new Map(
    returned.map((row) => [lineKey(row.catalogItemId, row.variantId), Number(row._sum.quantity ?? 0)]),
  );
  const currencyByItem = new Map(catalogItems.map((c) => [c.id, c.currency]));

  // Block M2: a return reverses the original DEMAND at the rate it was
  // originally booked at (via the aggregated _sum, same as unitPriceSnapshot
  // below), not a fresh rate at return time — a return should undo exactly
  // what was recorded, not re-price it.
  const linesCreateData: {
    catalogItemId: string;
    variantId: string | null;
    quantity: number;
    unitPriceSnapshot: number;
    currency: string | null;
    rateSnapshot: number | null;
  }[] = [];
  for (const line of data.lines) {
    const variantId = line.variantId ?? null;
    const key = lineKey(line.catalogItemId, variantId);
    const demandRow = demandedByKey.get(key);
    if (!demandRow) {
      return { error: "Эта позиция не отгружалась по данному заказу" };
    }
    const totalDemanded = Number(demandRow._sum.quantity ?? 0);
    const alreadyReturned = returnedByKey.get(key) ?? 0;
    const remaining = totalDemanded - alreadyReturned;
    if (line.quantity > remaining) {
      return {
        error: `Нельзя вернуть больше, чем было отгружено (доступно: ${remaining})`,
      };
    }
    linesCreateData.push({
      catalogItemId: line.catalogItemId,
      // Block M6: taken from the matched DEMAND aggregate, not the caller's
      // input — same principle as unitPriceSnapshot/rateSnapshot below.
      variantId: demandRow.variantId,
      quantity: line.quantity,
      unitPriceSnapshot: Number(demandRow._sum.unitPriceSnapshot ?? 0),
      currency: currencyByItem.get(line.catalogItemId) ?? null,
      rateSnapshot: demandRow._sum.rateSnapshot ? Number(demandRow._sum.rateSnapshot) : null,
    });
  }

  const number = await nextMovementNumber(ctx.orgId);
  // Order redesign: wrapped in a transaction (wasn't previously) so the
  // movement and the reservation resync land atomically — a return grows
  // "shipped minus returned" back down, so the order's own reservation
  // should grow back with it (capped again by what's actually still on the
  // order, via syncOrderReservations/getOrderRemainingByKey).
  const movement = await prisma.$transaction(async (tx) => {
    const created = await tx.stockMovement.create({
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
    await syncOrderReservations(tx, ctx.orgId, orderId);
    return created;
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
      by: ["catalogItemId", "variantId"],
      where: { movement: { purchaseOrderId, type: "SUPPLY" } },
      _sum: { quantity: true, unitPriceSnapshot: true, rateSnapshot: true },
    }),
    prisma.stockMovementLine.groupBy({
      by: ["catalogItemId", "variantId"],
      where: { movement: { purchaseOrderId, type: "PURCHASE_RETURN" } },
      _sum: { quantity: true },
    }),
    prisma.catalogItem.findMany({
      where: { id: { in: data.lines.map((l) => l.catalogItemId) } },
      select: { id: true, currency: true },
    }),
  ]);
  const suppliedByKey = new Map(supplied.map((row) => [lineKey(row.catalogItemId, row.variantId), row]));
  const returnedByKey = new Map(
    returned.map((row) => [lineKey(row.catalogItemId, row.variantId), Number(row._sum.quantity ?? 0)]),
  );
  const currencyByItem = new Map(catalogItems.map((c) => [c.id, c.currency]));

  // Block M2: reverses the original SUPPLY at the rate it was originally
  // booked at (see createSalesReturn's comment above for the reasoning).
  const linesCreateData: {
    catalogItemId: string;
    variantId: string | null;
    quantity: number;
    unitPriceSnapshot: number;
    currency: string | null;
    rateSnapshot: number | null;
  }[] = [];
  for (const line of data.lines) {
    const variantId = line.variantId ?? null;
    const key = lineKey(line.catalogItemId, variantId);
    const supplyRow = suppliedByKey.get(key);
    if (!supplyRow) {
      return { error: "Эта позиция не принималась по данному заказу поставщику" };
    }
    const totalSupplied = Number(supplyRow._sum.quantity ?? 0);
    const alreadyReturned = returnedByKey.get(key) ?? 0;
    const remaining = totalSupplied - alreadyReturned;
    if (line.quantity > remaining) {
      return {
        error: `Нельзя вернуть больше, чем было принято (доступно: ${remaining})`,
      };
    }
    linesCreateData.push({
      catalogItemId: line.catalogItemId,
      // Block M6: taken from the matched SUPPLY aggregate, not the caller's
      // input — same principle as createSalesReturn above.
      variantId: supplyRow.variantId,
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

import { prisma, type Tx } from "@/lib/prisma";

// Block M6: composite key for grouping/matching by (item, variant) — shared
// with actions/fulfillment.ts, which imports this rather than keeping its
// own copy now that this file exists.
export function lineKey(catalogItemId: string, variantId: string | null): string {
  return `${catalogItemId}:${variantId ?? ""}`;
}

export interface OrderRemainingLine {
  catalogItemId: string;
  variantId: string | null;
  /** Ordered quantity minus already-demanded quantity, floored at 0. */
  quantity: number;
}

/**
 * Order redesign: ordered-minus-already-shipped, per (item, variant) line —
 * extracted from the over-fulfillment check that already lived inline in
 * actions/fulfillment.ts::createDemand, reused there and by
 * syncOrderReservations below. Services/bundles are excluded, same guard
 * createDemand already applies (only PRODUCT-type items ever touch the
 * stock ledger).
 */
export async function getOrderRemainingByKey(tx: Tx, orderId: string): Promise<Map<string, OrderRemainingLine>> {
  const order = await tx.order.findUniqueOrThrow({
    where: { id: orderId },
    include: { lineItems: { include: { catalogItem: true } } },
  });
  // "Создать документ" flow: a draft (unposted) DEMAND hasn't actually
  // shipped anything — must not shrink "remaining to ship" or the order's
  // reservation before it's posted. Block K remainder: RETAIL_SALE counts
  // the same way — "Создать документ" → "Розничная продажа" links the
  // resulting movement back to the order (see actions/retail-sales.ts's
  // checkoutSale), and ringing an order up at the register is just as much
  // "shipped" as a formal Отгрузка. RETAIL_SALE has no draft state of its
  // own (always created already posted), so the isPosted filter is a no-op
  // for it, not a behavior change.
  const demanded = await tx.stockMovementLine.groupBy({
    by: ["catalogItemId", "variantId"],
    where: { movement: { orderId, type: { in: ["DEMAND", "RETAIL_SALE"] }, isPosted: true } },
    _sum: { quantity: true },
  });
  const demandedByKey = new Map(
    demanded.map((row) => [lineKey(row.catalogItemId, row.variantId), Number(row._sum.quantity ?? 0)]),
  );

  const result = new Map<string, OrderRemainingLine>();
  for (const li of order.lineItems) {
    if (li.catalogItem.type !== "PRODUCT") continue;
    const key = lineKey(li.catalogItemId, li.variantId);
    const shipped = demandedByKey.get(key) ?? 0;
    result.set(key, {
      catalogItemId: li.catalogItemId,
      variantId: li.variantId,
      quantity: Math.max(0, Number(li.quantity) - shipped),
    });
  }
  return result;
}

/**
 * Order redesign: reconciles this order's `StockReservation` rows to match
 * its current isPosted/isReserved/storeId state and remaining (ordered
 * minus shipped) quantities — a "soft hold" on stock, kept entirely
 * separate from the StockMovement/StockBatch FIFO ledger (which is for real
 * physical movements only). Wholesale replace, same idiom as OrderLineItem
 * rows being fully deleted+recreated on every upsertOrder call. Call inside
 * the same transaction as whatever changed the order's posted/reserved
 * state, its store, its line items, or its shipped/returned quantities
 * (upsertOrder, createDemand, createSalesReturn) — this function itself
 * does not open its own transaction, it must run inside the caller's `tx`.
 */
export async function syncOrderReservations(tx: Tx, orgId: string, orderId: string): Promise<void> {
  const order = await tx.order.findUniqueOrThrow({
    where: { id: orderId },
    include: { lineItems: { include: { catalogItem: true } } },
  });

  if (!(order.isPosted && order.isReserved && order.storeId)) {
    await tx.stockReservation.deleteMany({ where: { orderId } });
    return;
  }

  // "Создать документ" flow: a draft (unposted) DEMAND hasn't actually
  // shipped anything — must not shrink "remaining to ship" or the order's
  // reservation before it's posted. Block K remainder: RETAIL_SALE counts
  // the same way — "Создать документ" → "Розничная продажа" links the
  // resulting movement back to the order (see actions/retail-sales.ts's
  // checkoutSale), and ringing an order up at the register is just as much
  // "shipped" as a formal Отгрузка. RETAIL_SALE has no draft state of its
  // own (always created already posted), so the isPosted filter is a no-op
  // for it, not a behavior change.
  const demanded = await tx.stockMovementLine.groupBy({
    by: ["catalogItemId", "variantId"],
    where: { movement: { orderId, type: { in: ["DEMAND", "RETAIL_SALE"] }, isPosted: true } },
    _sum: { quantity: true },
  });
  const demandedByKey = new Map(
    demanded.map((row) => [lineKey(row.catalogItemId, row.variantId), Number(row._sum.quantity ?? 0)]),
  );

  const storeId = order.storeId;
  const data = order.lineItems
    .filter((li) => li.catalogItem.type === "PRODUCT")
    .map((li) => {
      const shipped = demandedByKey.get(lineKey(li.catalogItemId, li.variantId)) ?? 0;
      return {
        orgId,
        orderId,
        storeId,
        catalogItemId: li.catalogItemId,
        variantId: li.variantId,
        quantity: Math.max(0, Number(li.quantity) - shipped),
      };
    })
    .filter((line) => line.quantity > 0);

  await tx.stockReservation.deleteMany({ where: { orderId } });
  if (data.length > 0) {
    await tx.stockReservation.createMany({ data });
  }
}

export interface OrderPaymentStatus {
  totalOrder: number;
  totalPaid: number;
  currency: string;
  isPaid: boolean;
}

/**
 * Order redesign: "Оплата" is never stored — always derived by comparing
 * Payment rows linked to this order against the order's total. Currency
 * handling stays naive, same documented simplification used throughout this
 * project (RetailSale/PurchaseOrder/P&L): only lines/payments matching the
 * first line's currency are summed, no conversion.
 *
 * Блок K remainder: also counts CashOrder{direction: "IN", orderId} — a
 * "Приходный ордер" (cash receipt) against this order is just as much
 * "оплачено" as a bank-transfer Payment, just recorded on a different
 * ledger (cash vs. non-cash). Both provenance-link to Order the same
 * optional-FK way.
 */
export async function computeOrderPaymentStatus(orderId: string): Promise<OrderPaymentStatus> {
  const lineItems = await prisma.orderLineItem.findMany({
    where: { orderId },
    select: { quantity: true, unitPriceSnapshot: true, currency: true },
  });
  const currency = lineItems[0]?.currency ?? "RUB";
  const totalOrder = lineItems
    .filter((li) => li.currency === currency)
    .reduce((sum, li) => sum + Number(li.unitPriceSnapshot) * Number(li.quantity), 0);

  const [payments, cashOrders] = await Promise.all([
    prisma.payment.findMany({
      where: { orderId, direction: "IN", currency },
      select: { amount: true },
    }),
    prisma.cashOrder.findMany({
      where: { orderId, direction: "IN", currency },
      select: { amount: true },
    }),
  ]);
  const totalPaid =
    payments.reduce((sum, p) => sum + Number(p.amount), 0) +
    cashOrders.reduce((sum, c) => sum + Number(c.amount), 0);

  return { totalOrder, totalPaid, currency, isPaid: totalPaid >= totalOrder && totalOrder > 0 };
}

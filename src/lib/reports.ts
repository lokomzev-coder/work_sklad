import { prisma, withDbRetry } from "@/lib/prisma";
import { getLatestRates, getOrgBaseCurrency, toBase } from "@/lib/currency";
import { getLastPurchaseUnitCosts } from "@/lib/production-cost";

export interface DateRange {
  from?: Date;
  to?: Date;
}

function dateFilter(range: DateRange) {
  const gte = range.from;
  const lte = range.to;
  if (!gte && !lte) return undefined;
  return { ...(gte ? { gte } : {}), ...(lte ? { lte } : {}) };
}

export interface TurnoverRow {
  catalogItemId: string;
  catalogItemName: string;
  qtyIn: number;
  qtyOut: number;
}

/**
 * Оборот per item over a period. MOVE is deliberately excluded — it's an
 * internal transfer between stores, not a change in total company-wide
 * stock, so counting it as "in"/"out" would double the numbers without
 * meaning anything.
 */
export async function getTurnoverReport(orgId: string, range: DateRange = {}): Promise<TurnoverRow[]> {
  const createdAt = dateFilter(range);

  const lines = await prisma.stockMovementLine.findMany({
    where: {
      movement: {
        orgId,
        type: {
          in: [
            "ENTER",
            "SUPPLY",
            "SALES_RETURN",
            "LOSS",
            "DEMAND",
            "PURCHASE_RETURN",
            "PRODUCTION_CONSUME",
            "PRODUCTION_OUTPUT",
          ],
        },
        ...(createdAt ? { createdAt } : {}),
      },
    },
    include: { movement: { select: { type: true } }, catalogItem: { select: { name: true } } },
  });

  const byItem = new Map<string, TurnoverRow>();
  const IN_TYPES = new Set(["ENTER", "SUPPLY", "SALES_RETURN", "PRODUCTION_OUTPUT"]);
  for (const line of lines) {
    const row = byItem.get(line.catalogItemId) ?? {
      catalogItemId: line.catalogItemId,
      catalogItemName: line.catalogItem.name,
      qtyIn: 0,
      qtyOut: 0,
    };
    if (IN_TYPES.has(line.movement.type)) {
      row.qtyIn += Number(line.quantity);
    } else {
      row.qtyOut += Number(line.quantity);
    }
    byItem.set(line.catalogItemId, row);
  }

  return [...byItem.values()].sort((a, b) => a.catalogItemName.localeCompare(b.catalogItemName));
}

export interface MoneyRow {
  id: string;
  createdAt: Date;
  direction: "IN" | "OUT";
  amount: number;
  currency: string;
  counterpartyName: string;
  comment: string | null;
}

export interface MoneyReport {
  rows: MoneyRow[];
  /** Converted to the org's base currency (lib/currency.ts) so mixed-currency
   * payments still sum into one meaningful number. */
  periodIn: number;
  periodOut: number;
  /** All-time cash position, not scoped to the period — a balance, not a flow. */
  currentBalance: number;
  baseCurrency: string;
}

export async function getMoneyReport(orgId: string, range: DateRange = {}): Promise<MoneyReport> {
  const createdAt = dateFilter(range);

  // withDbRetry (lib/prisma.ts): see orders/[id]/page.tsx's comment — local
  // `prisma dev` proxy can drop a burst of simultaneous new connections;
  // safe here, every query is read-only.
  const [periodPayments, allTimePayments, baseCurrency, rates] = await withDbRetry(() => Promise.all([
    prisma.payment.findMany({
      where: { orgId, ...(createdAt ? { createdAt } : {}) },
      include: { counterparty: { select: { name: true } } },
      orderBy: { createdAt: "desc" },
    }),
    prisma.payment.findMany({
      where: { orgId },
      select: { direction: true, amount: true, currency: true, rateSnapshot: true },
    }),
    getOrgBaseCurrency(orgId),
    getLatestRates(orgId),
  ]));

  // Block M2: rateSnapshot (captured at posting time) takes priority over
  // today's rate — see toBase's own comment.
  const convert = (amount: number, currency: string, rateSnapshot: unknown) =>
    toBase(rates, baseCurrency, amount, currency, rateSnapshot ? Number(rateSnapshot) : null);

  const inTotal = allTimePayments
    .filter((p) => p.direction === "IN")
    .reduce((sum, p) => sum + convert(Number(p.amount), p.currency, p.rateSnapshot), 0);
  const outTotal = allTimePayments
    .filter((p) => p.direction === "OUT")
    .reduce((sum, p) => sum + convert(Number(p.amount), p.currency, p.rateSnapshot), 0);

  const periodIn = periodPayments
    .filter((p) => p.direction === "IN")
    .reduce((sum, p) => sum + convert(Number(p.amount), p.currency, p.rateSnapshot), 0);
  const periodOut = periodPayments
    .filter((p) => p.direction === "OUT")
    .reduce((sum, p) => sum + convert(Number(p.amount), p.currency, p.rateSnapshot), 0);

  return {
    rows: periodPayments.map((p) => ({
      id: p.id,
      createdAt: p.createdAt,
      direction: p.direction,
      amount: Number(p.amount),
      currency: p.currency,
      counterpartyName: p.counterparty.name,
      comment: p.comment,
    })),
    periodIn,
    periodOut,
    currentBalance: inTotal - outTotal,
    baseCurrency,
  };
}

export interface PnlReport {
  revenue: number;
  costOfGoods: number;
  grossMargin: number;
  baseCurrency: string;
}

/**
 * Revenue is what was actually shipped (DEMAND lines, at the order's
 * snapshotted sale price). Cost of goods for the purchased-goods flow is now
 * (Block M1) matched FIFO to the specific StockBatch(es) each DEMAND line
 * drew from (see lib/stock-batches.ts::allocateFifo, called from
 * createDemand) — not "everything bought in the period" like before. Any
 * portion of a sale that couldn't be matched to a batch (pre-M1 history,
 * manual ENTER stock with no purchase cost basis, or overselling beyond
 * tracked receipts) falls back to the item's last-known purchase price via
 * getLastPurchaseUnitCosts (same helper production costing already uses —
 * not a new pricing concept). PRODUCTION_OUTPUT (manufactured goods) is
 * deliberately NOT part of the FIFO batching — a documented Block M1 scope
 * boundary, not an oversight — so it keeps the old period-received
 * approximation. PRODUCTION_CONSUME is deliberately excluded — the raw
 * materials it consumes were already counted once, when originally bought;
 * counting them again as they're consumed into production would double the
 * cost. Amounts are converted to the org's base currency (lib/currency.ts)
 * before summing, using each line's rateSnapshot (Block M2) — the rate at
 * the moment it was posted — when available, not today's rate.
 */
export async function getPnlReport(orgId: string, range: DateRange = {}): Promise<PnlReport> {
  const createdAt = dateFilter(range);

  // withDbRetry: see getMoneyReport's comment above.
  const [demandLines, productionOutputLines, baseCurrency, rates] = await withDbRetry(() =>
    Promise.all([
      prisma.stockMovementLine.findMany({
        where: { movement: { orgId, type: "DEMAND", ...(createdAt ? { createdAt } : {}) } },
        select: {
          catalogItemId: true,
          quantity: true,
          unitPriceSnapshot: true,
          currency: true,
          rateSnapshot: true,
          batchAllocations: { select: { quantity: true, unitCost: true, currency: true, rateSnapshot: true } },
        },
      }),
      prisma.stockMovementLine.findMany({
        where: { movement: { orgId, type: "PRODUCTION_OUTPUT", ...(createdAt ? { createdAt } : {}) } },
        select: { quantity: true, unitPriceSnapshot: true, currency: true, rateSnapshot: true },
      }),
      getOrgBaseCurrency(orgId),
      getLatestRates(orgId),
    ]),
  );

  // Block M2: rateSnapshot (captured at posting time) takes priority over
  // today's rate — see toBase's own comment.
  const sumLines = (
    lines: { quantity: unknown; unitPriceSnapshot: unknown; currency: string | null; rateSnapshot: unknown }[],
  ) =>
    lines.reduce(
      (sum, l) =>
        sum +
        toBase(
          rates,
          baseCurrency,
          Number(l.quantity) * Number(l.unitPriceSnapshot ?? 0),
          l.currency ?? baseCurrency,
          l.rateSnapshot ? Number(l.rateSnapshot) : null,
        ),
      0,
    );

  const revenue = sumLines(demandLines);

  // Block M1: FIFO-matched cost for the portion of each sale that has a
  // batch allocation, plus a fallback for whatever doesn't.
  let batchMatchedCost = 0;
  const uncoveredByItem = new Map<string, number>();
  for (const line of demandLines) {
    const allocatedQty = line.batchAllocations.reduce((sum, a) => sum + Number(a.quantity), 0);
    for (const a of line.batchAllocations) {
      batchMatchedCost += toBase(
        rates,
        baseCurrency,
        Number(a.quantity) * Number(a.unitCost),
        a.currency ?? baseCurrency,
        a.rateSnapshot ? Number(a.rateSnapshot) : null,
      );
    }
    const uncovered = Number(line.quantity) - allocatedQty;
    if (uncovered > 0) {
      uncoveredByItem.set(line.catalogItemId, (uncoveredByItem.get(line.catalogItemId) ?? 0) + uncovered);
    }
  }
  const fallbackCosts = await getLastPurchaseUnitCosts(orgId, [...uncoveredByItem.keys()]);
  let fallbackCost = 0;
  for (const [catalogItemId, qty] of uncoveredByItem) {
    const unitCost = fallbackCosts.get(catalogItemId)?.unitCost ?? 0;
    fallbackCost += toBase(rates, baseCurrency, qty * unitCost, baseCurrency);
  }

  const costOfGoods = batchMatchedCost + fallbackCost + sumLines(productionOutputLines);

  return { revenue, costOfGoods, grossMargin: revenue - costOfGoods, baseCurrency };
}

function dayKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function eachDay(from: Date, to: Date): string[] {
  const days: string[] = [];
  const cursor = new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), from.getUTCDate()));
  const end = new Date(Date.UTC(to.getUTCFullYear(), to.getUTCMonth(), to.getUTCDate()));
  while (cursor <= end) {
    days.push(dayKey(cursor));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return days;
}

/** % change from `prev` to `current`, or null when there's nothing to compare
 * against (prev === 0) — a "+∞%" badge would be meaningless. */
function pctChange(current: number, prev: number): number | null {
  if (prev === 0) return null;
  return ((current - prev) / prev) * 100;
}

export interface OverviewKpis {
  revenue: number;
  revenueChangePct: number | null;
  ordersCount: number;
  ordersChangePct: number | null;
  avgOrderValue: number;
  cashBalance: number;
  activePurchaseOrders: number;
}

export interface DailyPoint {
  date: string;
  revenue: number;
  cashIn: number;
  cashOut: number;
  // Lets DailyPoint[] flow straight into AreaTrendChart's generic
  // `{ date: string } & Record<string, string | number>` data prop.
  [key: string]: string | number;
}

export interface StatusBreakdownRow {
  name: string;
  color: string;
  count: number;
}

export interface StockActivityRow {
  type: string;
  qty: number;
}

export interface OverviewReport {
  kpis: OverviewKpis;
  daily: DailyPoint[];
  orderStatusBreakdown: StatusBreakdownRow[];
  stockActivity: StockActivityRow[];
  topClients: { name: string; revenue: number }[];
  topItems: { name: string; qty: number }[];
  baseCurrency: string;
}

/**
 * Cross-domain "Обзор" report (reports/overview): sales, cash flow, warehouse
 * activity and top-N breakdowns for one period, plus a period-over-period
 * comparison for the headline KPIs. Deliberately built on the same
 * conversion helpers and query shapes as the other report functions in this
 * file (getMoneyReport, getTurnoverReport, getSalesByClientReport) rather
 * than inventing a new data-access pattern.
 */
export async function getOverviewReport(orgId: string, range: DateRange = {}): Promise<OverviewReport> {
  const to = range.to ?? new Date();
  const from = range.from ?? new Date(to.getTime() - 29 * 24 * 60 * 60 * 1000);
  const periodMs = to.getTime() - from.getTime();
  const prevTo = new Date(from.getTime() - 1);
  const prevFrom = new Date(prevTo.getTime() - periodMs);

  // Block: split into two sequential batches + withDbRetry each (see
  // orders/[id]/page.tsx's comment for why) — the second batch's
  // getSalesByClientReport/getTurnoverReport calls run their OWN internal
  // Promise.all fan-out, so leaving them inside this same outer Promise.all
  // meant the true peak concurrent-connection count was well above the
  // visible 10 array items (closer to ~15, counting the nested queries and
  // the getOrgBaseCurrency/getLatestRates calls duplicated between here and
  // getSalesByClientReport's own batch). Running the raw queries first and
  // the nested-report calls after — instead of all at once — keeps the peak
  // lower without changing any of the report math.
  const [orders, prevOrders, payments, allTimePayments, stockLines, activePurchaseOrders] = await withDbRetry(() =>
    Promise.all([
      prisma.order.findMany({
        where: { orgId, createdAt: { gte: from, lte: to } },
        select: {
          createdAt: true,
          status: { select: { name: true, color: true } },
          lineItems: { select: { quantity: true, unitPriceSnapshot: true, currency: true } },
        },
      }),
      prisma.order.findMany({
        where: { orgId, createdAt: { gte: prevFrom, lte: prevTo } },
        select: { lineItems: { select: { quantity: true, unitPriceSnapshot: true, currency: true } } },
      }),
      prisma.payment.findMany({
        where: { orgId, createdAt: { gte: from, lte: to } },
        select: { createdAt: true, direction: true, amount: true, currency: true, rateSnapshot: true },
      }),
      prisma.payment.findMany({
        where: { orgId },
        select: { direction: true, amount: true, currency: true, rateSnapshot: true },
      }),
      prisma.stockMovementLine.findMany({
        where: { movement: { orgId, createdAt: { gte: from, lte: to } } },
        select: { quantity: true, movement: { select: { type: true } } },
      }),
      prisma.purchaseOrder.count({ where: { orgId, status: { isFinal: false } } }),
    ]),
  );

  const [baseCurrency, rates, topClients, turnover] = await withDbRetry(() =>
    Promise.all([
      getOrgBaseCurrency(orgId),
      getLatestRates(orgId),
      getSalesByClientReport(orgId),
      getTurnoverReport(orgId, range),
    ]),
  );

  // orderTotal (OrderLineItem-based, no rateSnapshot — see ROADMAP Block M2's
  // documented scope boundary) stays on today's rate. convertPayment (Block
  // M2) prefers each Payment's own rateSnapshot when present.
  const orderTotal = (lineItems: { quantity: unknown; unitPriceSnapshot: unknown; currency: string }[]) =>
    lineItems.reduce(
      (sum, li) => sum + toBase(rates, baseCurrency, Number(li.unitPriceSnapshot) * Number(li.quantity), li.currency),
      0,
    );
  const convertPayment = (amount: number, currency: string, rateSnapshot: unknown) =>
    toBase(rates, baseCurrency, amount, currency, rateSnapshot ? Number(rateSnapshot) : null);

  const revenue = orders.reduce((sum, o) => sum + orderTotal(o.lineItems), 0);
  const prevRevenue = prevOrders.reduce((sum, o) => sum + orderTotal(o.lineItems), 0);

  const inTotal = allTimePayments
    .filter((p) => p.direction === "IN")
    .reduce((sum, p) => sum + convertPayment(Number(p.amount), p.currency, p.rateSnapshot), 0);
  const outTotal = allTimePayments
    .filter((p) => p.direction === "OUT")
    .reduce((sum, p) => sum + convertPayment(Number(p.amount), p.currency, p.rateSnapshot), 0);

  const days = eachDay(from, to);
  const dailyMap = new Map<string, DailyPoint>(days.map((d) => [d, { date: d, revenue: 0, cashIn: 0, cashOut: 0 }]));
  for (const order of orders) {
    const point = dailyMap.get(dayKey(order.createdAt));
    if (point) point.revenue += orderTotal(order.lineItems);
  }
  for (const payment of payments) {
    const point = dailyMap.get(dayKey(payment.createdAt));
    if (!point) continue;
    const amount = convertPayment(Number(payment.amount), payment.currency, payment.rateSnapshot);
    if (payment.direction === "IN") point.cashIn += amount;
    else point.cashOut += amount;
  }

  const statusMap = new Map<string, StatusBreakdownRow>();
  for (const order of orders) {
    const key = order.status.name;
    const row = statusMap.get(key) ?? { name: key, color: order.status.color, count: 0 };
    row.count += 1;
    statusMap.set(key, row);
  }

  const stockByType = new Map<string, number>();
  for (const line of stockLines) {
    stockByType.set(line.movement.type, (stockByType.get(line.movement.type) ?? 0) + Number(line.quantity));
  }

  return {
    kpis: {
      revenue,
      revenueChangePct: pctChange(revenue, prevRevenue),
      ordersCount: orders.length,
      ordersChangePct: pctChange(orders.length, prevOrders.length),
      avgOrderValue: orders.length ? revenue / orders.length : 0,
      cashBalance: inTotal - outTotal,
      activePurchaseOrders,
    },
    daily: [...dailyMap.values()],
    orderStatusBreakdown: [...statusMap.values()].sort((a, b) => b.count - a.count),
    stockActivity: [...stockByType.entries()]
      .map(([type, qty]) => ({ type, qty }))
      .sort((a, b) => b.qty - a.qty),
    topClients: topClients
      .slice()
      .sort((a, b) => b.orderTotal - a.orderTotal)
      .slice(0, 5)
      .map((c) => ({ name: c.clientName, revenue: c.orderTotal })),
    topItems: turnover
      .slice()
      .sort((a, b) => b.qtyOut - a.qtyOut)
      .slice(0, 5)
      .map((t) => ({ name: t.catalogItemName, qty: t.qtyOut })),
    baseCurrency,
  };
}

export interface ClientSalesRow {
  clientId: string;
  clientName: string;
  orderTotal: number;
  paymentsReceived: number;
  receivable: number;
}

export async function getSalesByClientReport(orgId: string): Promise<ClientSalesRow[]> {
  // withDbRetry: see getMoneyReport's comment above.
  const [clients, paymentsIn, baseCurrency, rates] = await withDbRetry(() =>
    Promise.all([
      prisma.client.findMany({
        where: { orgId, orders: { some: {} } },
        include: { orders: { include: { lineItems: true } } },
        orderBy: { name: "asc" },
      }),
      prisma.payment.findMany({
        where: { orgId, direction: "IN" },
        select: { counterpartyId: true, amount: true, currency: true, rateSnapshot: true },
      }),
      getOrgBaseCurrency(orgId),
      getLatestRates(orgId),
    ]),
  );

  const paymentsByClient = new Map<string, number>();
  for (const p of paymentsIn) {
    const converted = toBase(rates, baseCurrency, Number(p.amount), p.currency, p.rateSnapshot ? Number(p.rateSnapshot) : null);
    paymentsByClient.set(p.counterpartyId, (paymentsByClient.get(p.counterpartyId) ?? 0) + converted);
  }

  return clients.map((c) => {
    const orderTotal = c.orders.reduce(
      (sum, o) =>
        sum +
        o.lineItems.reduce(
          (s, li) => s + toBase(rates, baseCurrency, Number(li.unitPriceSnapshot) * Number(li.quantity), li.currency),
          0,
        ),
      0,
    );
    const paymentsReceived = paymentsByClient.get(c.id) ?? 0;
    return {
      clientId: c.id,
      clientName: c.name,
      orderTotal,
      paymentsReceived,
      receivable: orderTotal - paymentsReceived,
    };
  });
}

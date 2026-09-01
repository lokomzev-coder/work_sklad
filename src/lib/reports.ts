import { prisma } from "@/lib/prisma";
import { getLatestRates, getOrgBaseCurrency, toBase } from "@/lib/currency";

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

  const [periodPayments, allTimePayments, baseCurrency, rates] = await Promise.all([
    prisma.payment.findMany({
      where: { orgId, ...(createdAt ? { createdAt } : {}) },
      include: { counterparty: { select: { name: true } } },
      orderBy: { createdAt: "desc" },
    }),
    prisma.payment.findMany({ where: { orgId }, select: { direction: true, amount: true, currency: true } }),
    getOrgBaseCurrency(orgId),
    getLatestRates(orgId),
  ]);

  const convert = (amount: number, currency: string) => toBase(rates, baseCurrency, amount, currency);

  const inTotal = allTimePayments
    .filter((p) => p.direction === "IN")
    .reduce((sum, p) => sum + convert(Number(p.amount), p.currency), 0);
  const outTotal = allTimePayments
    .filter((p) => p.direction === "OUT")
    .reduce((sum, p) => sum + convert(Number(p.amount), p.currency), 0);

  const periodIn = periodPayments
    .filter((p) => p.direction === "IN")
    .reduce((sum, p) => sum + convert(Number(p.amount), p.currency), 0);
  const periodOut = periodPayments
    .filter((p) => p.direction === "OUT")
    .reduce((sum, p) => sum + convert(Number(p.amount), p.currency), 0);

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
 * Deliberately simplified P&L: revenue is what was actually shipped (DEMAND
 * lines, at the order's snapshotted sale price), cost of goods is what was
 * actually received in the period — either bought (SUPPLY lines, at the PO's
 * snapshotted cost) or manufactured (PRODUCTION_OUTPUT lines, at the costed
 * unitPriceSnapshot computed in completeProductionOrder from consumed
 * materials + techCard.laborCost). PRODUCTION_CONSUME is deliberately
 * excluded here — the raw materials it consumes were already counted once,
 * when they were originally bought (SUPPLY); counting them again as they're
 * consumed into production would double the cost. This is NOT proper COGS
 * matching (no FIFO/weighted-average costing tying a specific sold unit to
 * the batch it was purchased or produced in) — it's a rough period P&L, good
 * enough for a MVP "Деньги/P&L" view. Amounts are converted to the org's base
 * currency (lib/currency.ts) before summing.
 */
export async function getPnlReport(orgId: string, range: DateRange = {}): Promise<PnlReport> {
  const createdAt = dateFilter(range);

  const [demandLines, supplyLines, productionOutputLines, baseCurrency, rates] = await Promise.all([
    prisma.stockMovementLine.findMany({
      where: { movement: { orgId, type: "DEMAND", ...(createdAt ? { createdAt } : {}) } },
      select: { quantity: true, unitPriceSnapshot: true, currency: true },
    }),
    prisma.stockMovementLine.findMany({
      where: { movement: { orgId, type: "SUPPLY", ...(createdAt ? { createdAt } : {}) } },
      select: { quantity: true, unitPriceSnapshot: true, currency: true },
    }),
    prisma.stockMovementLine.findMany({
      where: { movement: { orgId, type: "PRODUCTION_OUTPUT", ...(createdAt ? { createdAt } : {}) } },
      select: { quantity: true, unitPriceSnapshot: true, currency: true },
    }),
    getOrgBaseCurrency(orgId),
    getLatestRates(orgId),
  ]);

  const sumLines = (lines: { quantity: unknown; unitPriceSnapshot: unknown; currency: string | null }[]) =>
    lines.reduce(
      (sum, l) =>
        sum + toBase(rates, baseCurrency, Number(l.quantity) * Number(l.unitPriceSnapshot ?? 0), l.currency ?? baseCurrency),
      0,
    );

  const revenue = sumLines(demandLines);
  const costOfGoods = sumLines(supplyLines) + sumLines(productionOutputLines);

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

  const [
    orders,
    prevOrders,
    payments,
    allTimePayments,
    stockLines,
    activePurchaseOrders,
    baseCurrency,
    rates,
    topClients,
    turnover,
  ] = await Promise.all([
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
      select: { createdAt: true, direction: true, amount: true, currency: true },
    }),
    prisma.payment.findMany({ where: { orgId }, select: { direction: true, amount: true, currency: true } }),
    prisma.stockMovementLine.findMany({
      where: { movement: { orgId, createdAt: { gte: from, lte: to } } },
      select: { quantity: true, movement: { select: { type: true } } },
    }),
    prisma.purchaseOrder.count({ where: { orgId, status: { isFinal: false } } }),
    getOrgBaseCurrency(orgId),
    getLatestRates(orgId),
    getSalesByClientReport(orgId),
    getTurnoverReport(orgId, range),
  ]);

  const convert = (amount: number, currency: string) => toBase(rates, baseCurrency, amount, currency);
  const orderTotal = (lineItems: { quantity: unknown; unitPriceSnapshot: unknown; currency: string }[]) =>
    lineItems.reduce((sum, li) => sum + convert(Number(li.unitPriceSnapshot) * Number(li.quantity), li.currency), 0);

  const revenue = orders.reduce((sum, o) => sum + orderTotal(o.lineItems), 0);
  const prevRevenue = prevOrders.reduce((sum, o) => sum + orderTotal(o.lineItems), 0);

  const inTotal = allTimePayments
    .filter((p) => p.direction === "IN")
    .reduce((sum, p) => sum + convert(Number(p.amount), p.currency), 0);
  const outTotal = allTimePayments
    .filter((p) => p.direction === "OUT")
    .reduce((sum, p) => sum + convert(Number(p.amount), p.currency), 0);

  const days = eachDay(from, to);
  const dailyMap = new Map<string, DailyPoint>(days.map((d) => [d, { date: d, revenue: 0, cashIn: 0, cashOut: 0 }]));
  for (const order of orders) {
    const point = dailyMap.get(dayKey(order.createdAt));
    if (point) point.revenue += orderTotal(order.lineItems);
  }
  for (const payment of payments) {
    const point = dailyMap.get(dayKey(payment.createdAt));
    if (!point) continue;
    const amount = convert(Number(payment.amount), payment.currency);
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
  const [clients, paymentsIn, baseCurrency, rates] = await Promise.all([
    prisma.client.findMany({
      where: { orgId, orders: { some: {} } },
      include: { orders: { include: { lineItems: true } } },
      orderBy: { name: "asc" },
    }),
    prisma.payment.findMany({
      where: { orgId, direction: "IN" },
      select: { counterpartyId: true, amount: true, currency: true },
    }),
    getOrgBaseCurrency(orgId),
    getLatestRates(orgId),
  ]);

  const paymentsByClient = new Map<string, number>();
  for (const p of paymentsIn) {
    const converted = toBase(rates, baseCurrency, Number(p.amount), p.currency);
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

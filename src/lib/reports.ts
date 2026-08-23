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
        type: { in: ["ENTER", "SUPPLY", "SALES_RETURN", "LOSS", "DEMAND", "PURCHASE_RETURN"] },
        ...(createdAt ? { createdAt } : {}),
      },
    },
    include: { movement: { select: { type: true } }, catalogItem: { select: { name: true } } },
  });

  const byItem = new Map<string, TurnoverRow>();
  const IN_TYPES = new Set(["ENTER", "SUPPLY", "SALES_RETURN"]);
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
 * actually received (SUPPLY lines, at the PO's snapshotted cost) in the same
 * period. This is NOT proper COGS matching (no FIFO/weighted-average
 * costing tying a specific sold unit to the batch it was purchased in) —
 * it's a rough period P&L, good enough for a MVP "Деньги/P&L" view. Amounts
 * are converted to the org's base currency (lib/currency.ts) before summing.
 */
export async function getPnlReport(orgId: string, range: DateRange = {}): Promise<PnlReport> {
  const createdAt = dateFilter(range);

  const [demandLines, supplyLines, baseCurrency, rates] = await Promise.all([
    prisma.stockMovementLine.findMany({
      where: { movement: { orgId, type: "DEMAND", ...(createdAt ? { createdAt } : {}) } },
      select: { quantity: true, unitPriceSnapshot: true, currency: true },
    }),
    prisma.stockMovementLine.findMany({
      where: { movement: { orgId, type: "SUPPLY", ...(createdAt ? { createdAt } : {}) } },
      select: { quantity: true, unitPriceSnapshot: true, currency: true },
    }),
    getOrgBaseCurrency(orgId),
    getLatestRates(orgId),
  ]);

  const revenue = demandLines.reduce(
    (sum, l) =>
      sum + toBase(rates, baseCurrency, Number(l.quantity) * Number(l.unitPriceSnapshot ?? 0), l.currency ?? baseCurrency),
    0,
  );
  const costOfGoods = supplyLines.reduce(
    (sum, l) =>
      sum + toBase(rates, baseCurrency, Number(l.quantity) * Number(l.unitPriceSnapshot ?? 0), l.currency ?? baseCurrency),
    0,
  );

  return { revenue, costOfGoods, grossMargin: revenue - costOfGoods, baseCurrency };
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

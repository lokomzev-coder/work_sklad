import { prisma, withDbRetry } from "@/lib/prisma";
import { getLatestRates, getOrgBaseCurrency, toBase } from "@/lib/currency";
import { getLastPurchaseUnitCosts } from "@/lib/production-cost";
import { getStockBalances } from "@/lib/stock";
import { variantLabel } from "@/lib/catalog-variants";

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
        // "Создать документ" flow: a draft (unposted) DEMAND hasn't
        // actually shipped — must not appear in turnover.
        isPosted: true,
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
            // Block E:
            "RETAIL_SALE",
            "RETAIL_RETURN",
          ],
        },
        ...(createdAt ? { createdAt } : {}),
      },
    },
    include: { movement: { select: { type: true } }, catalogItem: { select: { name: true } } },
  });

  const byItem = new Map<string, TurnoverRow>();
  const IN_TYPES = new Set(["ENTER", "SUPPLY", "SALES_RETURN", "PRODUCTION_OUTPUT", "RETAIL_RETURN"]);
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

export interface TurnoverDailyPoint {
  date: string;
  qtyIn: number;
  qtyOut: number;
  [key: string]: string | number;
}

/**
 * Block G2 phase 1 — same movement set as getTurnoverReport, just bucketed
 * by day across the whole company instead of by item — a per-item daily
 * series would be too many lines for one chart to be readable, and the
 * existing table below the chart already gives the per-item breakdown.
 * Only populated when both `range` bounds are given — same convention as
 * getMoneyReport.daily/getPnlReport.daily.
 */
export async function getTurnoverDailyReport(orgId: string, range: DateRange = {}): Promise<TurnoverDailyPoint[]> {
  if (!range.from || !range.to) return [];
  const createdAt = dateFilter(range);

  const lines = await withDbRetry(() =>
    prisma.stockMovementLine.findMany({
      where: {
        movement: {
          orgId,
          isPosted: true,
          type: {
            in: [
              "ENTER", "SUPPLY", "SALES_RETURN", "LOSS", "DEMAND", "PURCHASE_RETURN",
              "PRODUCTION_CONSUME", "PRODUCTION_OUTPUT", "RETAIL_SALE", "RETAIL_RETURN",
            ],
          },
          ...(createdAt ? { createdAt } : {}),
        },
      },
      select: { quantity: true, movement: { select: { type: true, createdAt: true } } },
    }),
  );

  const IN_TYPES = new Set(["ENTER", "SUPPLY", "SALES_RETURN", "PRODUCTION_OUTPUT", "RETAIL_RETURN"]);
  const days = eachDay(range.from, range.to);
  const dailyMap = new Map<string, TurnoverDailyPoint>(days.map((d) => [d, { date: d, qtyIn: 0, qtyOut: 0 }]));
  for (const line of lines) {
    const point = dailyMap.get(dayKey(line.movement.createdAt));
    if (!point) continue;
    if (IN_TYPES.has(line.movement.type)) point.qtyIn += Number(line.quantity);
    else point.qtyOut += Number(line.quantity);
  }
  return [...dailyMap.values()];
}

export interface StockShortfallRow {
  catalogItemId: string;
  catalogItemName: string;
  quantity: number;
  minStock: number;
  shortfall: number;
}

/**
 * МойСклад's report/stock/shortfall — items whose current balance (summed
 * across all stores; `minStock` has no per-store dimension, see its schema
 * comment) is below the configured threshold. Only items with `minStock`
 * actually set are considered — null means "not tracked", not "zero
 * allowed", so it's excluded rather than always flagged as short.
 */
export async function getStockShortfallReport(orgId: string): Promise<StockShortfallRow[]> {
  const [items, balances] = await withDbRetry(() =>
    Promise.all([
      prisma.catalogItem.findMany({
        where: { orgId, status: "ACTIVE", minStock: { not: null } },
        select: { id: true, name: true, minStock: true },
      }),
      getStockBalances(orgId),
    ]),
  );
  if (items.length === 0) return [];

  const qtyByItem = new Map<string, number>();
  for (const b of balances) {
    qtyByItem.set(b.catalogItemId, (qtyByItem.get(b.catalogItemId) ?? 0) + Number(b.quantity));
  }

  return items
    .map((item) => {
      const quantity = qtyByItem.get(item.id) ?? 0;
      const minStock = Number(item.minStock);
      return { catalogItemId: item.id, catalogItemName: item.name, quantity, minStock, shortfall: minStock - quantity };
    })
    .filter((row) => row.shortfall > 0)
    .sort((a, b) => b.shortfall - a.shortfall);
}

export interface StockTurnoverRow {
  catalogItemId: string;
  catalogItemName: string;
  avgDaysInStock: number;
  qtyConsumed: number;
}

/**
 * Block G2 phase 5 — average time from receipt to sale, per item, over the
 * period. Not a new inventory-tracking mechanism: this reads the existing
 * FIFO allocator's own records (`StockBatchAllocation`, Block M1) — every
 * sale is already matched to the exact batch(es) it drew from, with the
 * batch's own receipt timestamp (`StockBatch.createdAt`) and the
 * allocation's own timestamp (`StockBatchAllocation.createdAt`, set at the
 * moment of the sale). Days-in-stock is simply the gap between the two,
 * weighted by quantity when one item had several allocations. Only sales
 * matched to a real batch are counted — a sale that fell back to the
 * "no batch, last purchase price" approximation (see getPnlReport's own
 * comment) has no receipt timestamp to measure from, so it's excluded
 * rather than guessed at.
 */
export async function getStockTurnoverReport(orgId: string, range: DateRange = {}): Promise<StockTurnoverRow[]> {
  const createdAt = dateFilter(range);

  const allocations = await withDbRetry(() =>
    prisma.stockBatchAllocation.findMany({
      where: { batch: { orgId }, ...(createdAt ? { createdAt } : {}) },
      select: {
        quantity: true,
        createdAt: true,
        batch: { select: { catalogItemId: true, catalogItem: { select: { name: true } }, createdAt: true } },
      },
    }),
  );

  const byItem = new Map<string, { catalogItemName: string; weightedDaysSum: number; qty: number }>();
  for (const a of allocations) {
    const qty = Number(a.quantity);
    const days = (a.createdAt.getTime() - a.batch.createdAt.getTime()) / (24 * 60 * 60 * 1000);
    const row = byItem.get(a.batch.catalogItemId) ?? {
      catalogItemName: a.batch.catalogItem.name,
      weightedDaysSum: 0,
      qty: 0,
    };
    row.weightedDaysSum += days * qty;
    row.qty += qty;
    byItem.set(a.batch.catalogItemId, row);
  }

  return [...byItem.entries()]
    .map(([catalogItemId, r]) => ({
      catalogItemId,
      catalogItemName: r.catalogItemName,
      avgDaysInStock: r.qty > 0 ? r.weightedDaysSum / r.qty : 0,
      qtyConsumed: r.qty,
    }))
    .sort((a, b) => b.avgDaysInStock - a.avgDaysInStock);
}

export interface StatusFunnelRow {
  statusId: string;
  name: string;
  color: string;
  position: number;
  isFinal: boolean;
  count: number;
}

/**
 * Block G2 phase 6 — **deliberately narrowed scope**: this is a funnel of
 * *current* distribution across statuses (ordered by `DocumentStatus.
 * position`, unlike getOverviewReport's own unordered orderStatusBreakdown),
 * NOT a true time-based conversion funnel ("X% of orders moved from status
 * A to status B within the period"). The schema has no log of *when* a
 * document's status changed — only its current `statusId` — so real
 * conversion tracking would require adding a new status-change history
 * model and wiring it into every status-mutation call site across
 * `actions/orders.ts`/`actions/purchase-orders.ts` (~15+ places) — a
 * separate, much larger feature, not "one more report". Documented here and
 * in ROADMAP.md as a conscious scope cut, not a silent gap.
 */
export async function getStatusFunnelReport(
  orgId: string,
  kind: "ORDER" | "PURCHASE_ORDER",
): Promise<StatusFunnelRow[]> {
  const statuses = await withDbRetry(() =>
    prisma.documentStatus.findMany({
      where: { orgId, kind },
      orderBy: { position: "asc" },
      select: {
        id: true,
        name: true,
        color: true,
        position: true,
        isFinal: true,
        // Selecting both counts unconditionally (rather than branching the
        // `select` shape on `kind` at runtime) keeps Prisma's generated
        // return type static and simple — cheap either way since only one
        // relation is ever non-empty per status (a status belongs to one
        // `kind`).
        _count: { select: { orders: true, purchaseOrders: true } },
      },
    }),
  );

  return statuses.map((s) => ({
    statusId: s.id,
    name: s.name,
    color: s.color,
    position: s.position,
    isFinal: s.isFinal,
    count: kind === "ORDER" ? s._count.orders : s._count.purchaseOrders,
  }));
}

export interface ExpiringBatchRow {
  batchId: string;
  catalogItemName: string;
  variantLabel: string | null;
  label: string | null;
  expiryDate: string;
  remainingQuantity: number;
  isExpired: boolean;
}

/**
 * МойСклад's consignment (партия со сроком годности) — batches with an
 * `expiryDate` set (Block O phase 8) and stock still remaining, soonest
 * first. Batches with no `expiryDate` (the vast majority — see StockBatch's
 * schema comment, this field is optional and unset by default) are simply
 * not in scope here, same "only what's tracked" convention as
 * getStockShortfallReport's `minStock`.
 */
export async function getExpiringBatchesReport(orgId: string): Promise<ExpiringBatchRow[]> {
  const batches = await withDbRetry(() =>
    prisma.stockBatch.findMany({
      where: { orgId, expiryDate: { not: null }, remainingQuantity: { gt: 0 } },
      include: {
        catalogItem: { select: { name: true } },
        variant: { include: { values: { include: { characteristic: true } } } },
      },
      orderBy: { expiryDate: "asc" },
    }),
  );

  const now = new Date();
  return batches.map((b) => ({
    batchId: b.id,
    catalogItemName: b.catalogItem.name,
    variantLabel: b.variant ? variantLabel(b.variant.values) || (b.variant.sku ?? b.variant.id) : null,
    label: b.label,
    expiryDate: b.expiryDate!.toISOString(),
    remainingQuantity: Number(b.remainingQuantity),
    isExpired: b.expiryDate! < now,
  }));
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

export interface MoneyDailyPoint {
  date: string;
  cashIn: number;
  cashOut: number;
  [key: string]: string | number;
}

export interface MoneyReport {
  rows: MoneyRow[];
  /** Converted to the org's base currency (lib/currency.ts) so mixed-currency
   * payments still sum into one meaningful number. */
  periodIn: number;
  periodOut: number;
  /** All-time cash position, not scoped to the period — a balance, not a flow. */
  currentBalance: number;
  // Block O phase 7 — МойСклад's report/money/plotseries: cash flow as a
  // time series, not just period totals. Only populated when both `range`
  // bounds are given (a day-by-day series over "all time" would be
  // meaningless/huge) — same convention as getOverviewReport's own `daily`.
  daily: MoneyDailyPoint[];
  // Block G2 phase 1 — period-over-period comparison, same idea and same
  // "only when both bounds are given" convention as `daily` (a preceding
  // period only makes sense relative to a bounded one) — null otherwise,
  // and also null when there's nothing in the preceding period to compare
  // against (see pctChange's own comment).
  periodInChangePct: number | null;
  periodOutChangePct: number | null;
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
      select: { direction: true, amount: true, currency: true, rateSnapshot: true, createdAt: true },
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

  let daily: MoneyDailyPoint[] = [];
  let periodInChangePct: number | null = null;
  let periodOutChangePct: number | null = null;
  if (range.from && range.to) {
    const days = eachDay(range.from, range.to);
    const dailyMap = new Map<string, MoneyDailyPoint>(days.map((d) => [d, { date: d, cashIn: 0, cashOut: 0 }]));
    for (const p of periodPayments) {
      const point = dailyMap.get(dayKey(p.createdAt));
      if (!point) continue;
      const amount = convert(Number(p.amount), p.currency, p.rateSnapshot);
      if (p.direction === "IN") point.cashIn += amount;
      else point.cashOut += amount;
    }
    daily = [...dailyMap.values()];

    // Block G2 phase 1: preceding period of the same length, same idiom as
    // getOverviewReport's own prevFrom/prevTo.
    const periodMs = range.to.getTime() - range.from.getTime();
    const prevTo = new Date(range.from.getTime() - 1);
    const prevFrom = new Date(prevTo.getTime() - periodMs);
    const prevPayments = allTimePayments.filter((p) => p.createdAt >= prevFrom && p.createdAt <= prevTo);
    const prevIn = prevPayments
      .filter((p) => p.direction === "IN")
      .reduce((sum, p) => sum + convert(Number(p.amount), p.currency, p.rateSnapshot), 0);
    const prevOut = prevPayments
      .filter((p) => p.direction === "OUT")
      .reduce((sum, p) => sum + convert(Number(p.amount), p.currency, p.rateSnapshot), 0);
    periodInChangePct = pctChange(periodIn, prevIn);
    periodOutChangePct = pctChange(periodOut, prevOut);
  }

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
    daily,
    periodInChangePct,
    periodOutChangePct,
    baseCurrency,
  };
}

export interface PnlDailyPoint {
  date: string;
  revenue: number;
  costOfGoods: number;
  grossMargin: number;
  [key: string]: string | number;
}

export interface PnlReport {
  revenue: number;
  costOfGoods: number;
  grossMargin: number;
  baseCurrency: string;
  // Block G2 phase 1 — same "only when both `range` bounds are given"
  // convention as getMoneyReport.daily/periodInChangePct.
  daily: PnlDailyPoint[];
  revenueChangePct: number | null;
  grossMarginChangePct: number | null;
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
export async function getPnlReport(
  orgId: string,
  range: DateRange = {},
  // Block G2 phase 1 — internal only: the recursive call computing the
  // preceding period for comparison passes this to stop it from ALSO
  // computing a comparison against an even-earlier period (would recurse
  // forever otherwise). Not part of the public signature's intent.
  _skipComparison = false,
): Promise<PnlReport> {
  const createdAt = dateFilter(range);

  // withDbRetry: see getMoneyReport's comment above.
  const [demandLines, productionOutputLines, baseCurrency, rates] = await withDbRetry(() =>
    Promise.all([
      prisma.stockMovementLine.findMany({
        // Block E: RETAIL_SALE joins DEMAND here — a retail checkout is
        // revenue exactly like an order-driven shipment, same FIFO
        // allocation mechanism (see actions/retail-sales.ts::checkoutSale),
        // same "no separate return subtraction" simplification already
        // accepted for SALES_RETURN above (not fixed here, not this
        // block's scope). isPosted: true — "Создать документ" flow: a
        // draft DEMAND hasn't shipped, must not count as revenue.
        where: {
          movement: { orgId, type: { in: ["DEMAND", "RETAIL_SALE"] }, isPosted: true, ...(createdAt ? { createdAt } : {}) },
        },
        select: {
          catalogItemId: true,
          quantity: true,
          unitPriceSnapshot: true,
          currency: true,
          rateSnapshot: true,
          batchAllocations: { select: { quantity: true, unitCost: true, currency: true, rateSnapshot: true } },
          // Block G2 phase 1: needed to bucket revenue/cost by day (`daily`).
          movement: { select: { createdAt: true } },
        },
      }),
      prisma.stockMovementLine.findMany({
        where: { movement: { orgId, type: "PRODUCTION_OUTPUT", ...(createdAt ? { createdAt } : {}) } },
        select: { quantity: true, unitPriceSnapshot: true, currency: true, rateSnapshot: true, movement: { select: { createdAt: true } } },
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

  let daily: PnlDailyPoint[] = [];
  if (range.from && range.to) {
    const days = eachDay(range.from, range.to);
    const dailyMap = new Map<string, PnlDailyPoint>(
      days.map((d) => [d, { date: d, revenue: 0, costOfGoods: 0, grossMargin: 0 }]),
    );
    const revenueOf = (l: { quantity: unknown; unitPriceSnapshot: unknown; currency: string | null; rateSnapshot: unknown }) =>
      toBase(
        rates,
        baseCurrency,
        Number(l.quantity) * Number(l.unitPriceSnapshot ?? 0),
        l.currency ?? baseCurrency,
        l.rateSnapshot ? Number(l.rateSnapshot) : null,
      );
    for (const line of demandLines) {
      const point = dailyMap.get(dayKey(line.movement.createdAt));
      if (!point) continue;
      point.revenue += revenueOf(line);
      const allocatedQty = line.batchAllocations.reduce((sum, a) => sum + Number(a.quantity), 0);
      for (const a of line.batchAllocations) {
        point.costOfGoods += toBase(
          rates,
          baseCurrency,
          Number(a.quantity) * Number(a.unitCost),
          a.currency ?? baseCurrency,
          a.rateSnapshot ? Number(a.rateSnapshot) : null,
        );
      }
      const uncovered = Number(line.quantity) - allocatedQty;
      if (uncovered > 0) {
        const unitCost = fallbackCosts.get(line.catalogItemId)?.unitCost ?? 0;
        point.costOfGoods += toBase(rates, baseCurrency, uncovered * unitCost, baseCurrency);
      }
    }
    for (const line of productionOutputLines) {
      const point = dailyMap.get(dayKey(line.movement.createdAt));
      if (point) point.costOfGoods += revenueOf(line);
    }
    for (const point of dailyMap.values()) point.grossMargin = point.revenue - point.costOfGoods;
    daily = [...dailyMap.values()];
  }

  let revenueChangePct: number | null = null;
  let grossMarginChangePct: number | null = null;
  if (range.from && range.to && !_skipComparison) {
    const periodMs = range.to.getTime() - range.from.getTime();
    const prevTo = new Date(range.from.getTime() - 1);
    const prevFrom = new Date(prevTo.getTime() - periodMs);
    const previous = await getPnlReport(orgId, { from: prevFrom, to: prevTo }, true);
    revenueChangePct = pctChange(revenue, previous.revenue);
    grossMarginChangePct = pctChange(revenue - costOfGoods, previous.grossMargin);
  }

  return { revenue, costOfGoods, grossMargin: revenue - costOfGoods, baseCurrency, daily, revenueChangePct, grossMarginChangePct };
}

export type PnlDimension = "product" | "client" | "employee" | "salesChannel" | "catalogGroup";

export interface PnlBreakdownRow {
  key: string;
  label: string;
  revenue: number;
  costOfGoods: number;
  grossMargin: number;
}

export interface PnlBreakdown {
  rows: PnlBreakdownRow[];
  baseCurrency: string;
}

/**
 * Same revenue/FIFO-cost math as getPnlReport, grouped by one of 5
 * dimensions instead of summed into one total — МойСклад's report/profit/*
 * (byproduct/bycounterparty/byemployee/bysaleschannel; byvariant folded into
 * "product" here rather than a separate dimension — a finer cut of the same
 * grouping, not worth a separate mode for this project's scale). `catalogGroup`
 * (Block G2 phase 2) has no МойСклад-named counterpart in the reviewed
 * document but was explicitly requested — groups items by
 * `CatalogItem.group`, an item with no group falls into a "Без группы"
 * pseudo-group (not silently dropped).
 * PRODUCTION_OUTPUT's cost addition (see getPnlReport's comment) is
 * deliberately NOT included here — it's inventory received, not a sale, so
 * it has no natural dimension to attribute to; the breakdown's total will
 * therefore be slightly below getPnlReport's own total whenever an org has
 * produced-goods activity in the period, a known, accepted discrepancy
 * rather than a bug. `employee`/`salesChannel` only have real values for
 * Order-driven DEMAND lines — a retail sale has neither concept, and is
 * bucketed under a "Розница" pseudo-group for those two dimensions only.
 */
export async function getPnlBreakdown(
  orgId: string,
  range: DateRange,
  dimension: PnlDimension,
): Promise<PnlBreakdown> {
  const createdAt = dateFilter(range);

  const [demandLines, baseCurrency, rates] = await withDbRetry(() =>
    Promise.all([
      prisma.stockMovementLine.findMany({
        where: {
          movement: { orgId, type: { in: ["DEMAND", "RETAIL_SALE"] }, isPosted: true, ...(createdAt ? { createdAt } : {}) },
        },
        select: {
          catalogItemId: true,
          catalogItem: { select: { name: true, groupId: true, group: { select: { name: true } } } },
          quantity: true,
          unitPriceSnapshot: true,
          currency: true,
          rateSnapshot: true,
          batchAllocations: { select: { quantity: true, unitCost: true, currency: true, rateSnapshot: true } },
          movement: {
            select: {
              order: {
                select: {
                  clientId: true,
                  assignedEmployeeId: true,
                  salesChannelId: true,
                  client: { select: { name: true } },
                  assignedEmployee: { select: { fullName: true } },
                  salesChannel: { select: { name: true } },
                },
              },
              retailSale: { select: { clientId: true, client: { select: { name: true } } } },
            },
          },
        },
      }),
      getOrgBaseCurrency(orgId),
      getLatestRates(orgId),
    ]),
  );

  const uncoveredCatalogItemIds = new Set<string>();
  for (const line of demandLines) {
    const allocatedQty = line.batchAllocations.reduce((sum, a) => sum + Number(a.quantity), 0);
    if (Number(line.quantity) - allocatedQty > 0) uncoveredCatalogItemIds.add(line.catalogItemId);
  }
  const fallbackCosts = await getLastPurchaseUnitCosts(orgId, [...uncoveredCatalogItemIds]);

  function keyFor(line: (typeof demandLines)[number]): { key: string; label: string } {
    const order = line.movement.order;
    const retailSale = line.movement.retailSale;
    if (dimension === "product") return { key: line.catalogItemId, label: line.catalogItem.name };
    if (dimension === "catalogGroup") {
      if (!line.catalogItem.groupId) return { key: "__none__", label: "Без группы" };
      return { key: line.catalogItem.groupId, label: line.catalogItem.group?.name ?? "—" };
    }
    if (dimension === "client") {
      const clientId = order?.clientId ?? retailSale?.clientId;
      if (!clientId) return { key: "__none__", label: "Без клиента" };
      return { key: clientId, label: order?.client?.name ?? retailSale?.client?.name ?? "—" };
    }
    if (dimension === "employee") {
      if (order?.assignedEmployeeId) return { key: order.assignedEmployeeId, label: order.assignedEmployee?.fullName ?? "—" };
      return { key: "__retail__", label: "Розница" };
    }
    // salesChannel
    if (order?.salesChannelId) return { key: order.salesChannelId, label: order.salesChannel?.name ?? "—" };
    return { key: "__retail__", label: "Розница" };
  }

  const groups = new Map<string, PnlBreakdownRow>();
  for (const line of demandLines) {
    const { key, label } = keyFor(line);
    const row = groups.get(key) ?? { key, label, revenue: 0, costOfGoods: 0, grossMargin: 0 };

    row.revenue += toBase(
      rates,
      baseCurrency,
      Number(line.quantity) * Number(line.unitPriceSnapshot ?? 0),
      line.currency ?? baseCurrency,
      line.rateSnapshot ? Number(line.rateSnapshot) : null,
    );

    const allocatedQty = line.batchAllocations.reduce((sum, a) => sum + Number(a.quantity), 0);
    for (const a of line.batchAllocations) {
      row.costOfGoods += toBase(
        rates,
        baseCurrency,
        Number(a.quantity) * Number(a.unitCost),
        a.currency ?? baseCurrency,
        a.rateSnapshot ? Number(a.rateSnapshot) : null,
      );
    }
    const uncovered = Number(line.quantity) - allocatedQty;
    if (uncovered > 0) {
      const unitCost = fallbackCosts.get(line.catalogItemId)?.unitCost ?? 0;
      row.costOfGoods += toBase(rates, baseCurrency, uncovered * unitCost, baseCurrency);
    }

    groups.set(key, row);
  }

  const rows = [...groups.values()]
    .map((r) => ({ ...r, grossMargin: r.revenue - r.costOfGoods }))
    .sort((a, b) => b.revenue - a.revenue);

  return { rows, baseCurrency };
}

export type AbcClass = "A" | "B" | "C";

export interface AbcRow {
  key: string;
  label: string;
  value: number;
  /** Share of the grand total, 0-100. */
  sharePct: number;
  /** Running share up to and including this row, sorted by `value` descending — 0-100. */
  cumulativePct: number;
  cls: AbcClass;
}

export interface AbcReport {
  rows: AbcRow[];
  baseCurrency: string;
}

/**
 * Classic ABC analysis (not a МойСклад-specific report by this name in the
 * reviewed document, but standard retail/inventory analysis, explicitly
 * requested): sort descending by value, classify by *cumulative* share of
 * the total — A up to 80%, B up to 95%, C the rest. Thresholds match the
 * conventional Pareto-based split used everywhere this analysis appears;
 * not configurable in this version (a real customization knob would be a
 * separate, larger feature, not this report's job).
 */
function classifyAbc<T extends { key: string; label: string; value: number }>(
  input: T[],
): AbcRow[] {
  const sorted = [...input].sort((a, b) => b.value - a.value);
  const total = sorted.reduce((sum, r) => sum + r.value, 0);
  let running = 0;
  return sorted.map((r) => {
    running += r.value;
    const cumulativePct = total > 0 ? (running / total) * 100 : 0;
    const cls: AbcClass = cumulativePct <= 80 ? "A" : cumulativePct <= 95 ? "B" : "C";
    return {
      key: r.key,
      label: r.label,
      value: r.value,
      sharePct: total > 0 ? (r.value / total) * 100 : 0,
      cumulativePct,
      cls,
    };
  });
}

/** ABC of catalog items by revenue over the period — built on top of
 * getPnlBreakdown's existing "product" grouping rather than a fresh query,
 * same revenue numbers a user would already see on the "По товару" tab. */
export async function getAbcByItem(orgId: string, range: DateRange): Promise<AbcReport> {
  const breakdown = await getPnlBreakdown(orgId, range, "product");
  return { rows: classifyAbc(breakdown.rows.map((r) => ({ key: r.key, label: r.label, value: r.revenue }))), baseCurrency: breakdown.baseCurrency };
}

/** ABC of clients by revenue over the period — same reuse idea, built on
 * getPnlBreakdown's "client" grouping. */
export async function getAbcByClient(orgId: string, range: DateRange): Promise<AbcReport> {
  const breakdown = await getPnlBreakdown(orgId, range, "client");
  return { rows: classifyAbc(breakdown.rows.map((r) => ({ key: r.key, label: r.label, value: r.revenue }))), baseCurrency: breakdown.baseCurrency };
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
// Block G2 phase 4 — configurable N for the top-clients/top-items lists
// (was a hardcoded 5); kept modest bounds so a mistyped huge value in the
// query string can't turn this into an unbounded, effectively full-table
// dump.
const DEFAULT_TOP_N = 5;
const MAX_TOP_N = 50;

export async function getOverviewReport(orgId: string, range: DateRange = {}, topN: number = DEFAULT_TOP_N): Promise<OverviewReport> {
  const clampedTopN = Math.max(1, Math.min(topN, MAX_TOP_N));
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
        // isPosted: true — "Создать документ" flow: a draft DEMAND hasn't
        // shipped, must not count as stock activity yet.
        where: { movement: { orgId, isPosted: true, createdAt: { gte: from, lte: to } } },
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
      .slice(0, clampedTopN)
      .map((c) => ({ name: c.clientName, revenue: c.orderTotal })),
    topItems: turnover
      .slice()
      .sort((a, b) => b.qtyOut - a.qtyOut)
      .slice(0, clampedTopN)
      .map((t) => ({ name: t.catalogItemName, qty: t.qtyOut })),
    baseCurrency,
  };
}

export interface ClientSalesRow {
  clientId: string;
  clientName: string;
  ordersCount: number;
  orderTotal: number;
  avgOrderValue: number;
  paymentsReceived: number;
  receivable: number;
  // Block O phase 7 — a Client can also be a supplier; a real "client card"
  // (МойСклад's report/counterparty) shows both sides, not just the
  // customer one, same two-independent-balances model as
  // lib/balances.ts::getClientBalance.
  purchaseOrdersCount: number;
  purchaseTotal: number;
  paymentsPaid: number;
  payable: number;
}

/**
 * A "client card" style report — one row per counterparty who has ANY
 * activity (customer orders OR supplier purchase orders), not just
 * customers as before. Loyalty points / true average-check-per-visit
 * (retail) are NOT included — this reads from Order/PurchaseOrder, not
 * RetailSale, matching the scope this report already had; adding retail
 * activity here would be a separate, explicit extension.
 */
export async function getSalesByClientReport(orgId: string): Promise<ClientSalesRow[]> {
  // withDbRetry: see getMoneyReport's comment above.
  const [clients, paymentsIn, paymentsOut, baseCurrency, rates] = await withDbRetry(() =>
    Promise.all([
      prisma.client.findMany({
        where: { orgId, OR: [{ orders: { some: {} } }, { purchaseOrders: { some: {} } }] },
        include: { orders: { include: { lineItems: true } }, purchaseOrders: { include: { lineItems: true } } },
        orderBy: { name: "asc" },
      }),
      prisma.payment.findMany({
        where: { orgId, direction: "IN" },
        select: { counterpartyId: true, amount: true, currency: true, rateSnapshot: true },
      }),
      prisma.payment.findMany({
        where: { orgId, direction: "OUT" },
        select: { counterpartyId: true, amount: true, currency: true, rateSnapshot: true },
      }),
      getOrgBaseCurrency(orgId),
      getLatestRates(orgId),
    ]),
  );

  function sumByClient(payments: { counterpartyId: string; amount: unknown; currency: string; rateSnapshot: unknown }[]) {
    const map = new Map<string, number>();
    for (const p of payments) {
      const converted = toBase(rates, baseCurrency, Number(p.amount), p.currency, p.rateSnapshot ? Number(p.rateSnapshot) : null);
      map.set(p.counterpartyId, (map.get(p.counterpartyId) ?? 0) + converted);
    }
    return map;
  }
  const paymentsByClient = sumByClient(paymentsIn);
  const paymentsOutByClient = sumByClient(paymentsOut);

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
    const purchaseTotal = c.purchaseOrders.reduce(
      (sum, po) =>
        sum +
        po.lineItems.reduce(
          (s, li) => s + toBase(rates, baseCurrency, Number(li.unitPriceSnapshot) * Number(li.quantity), li.currency),
          0,
        ),
      0,
    );
    const paymentsReceived = paymentsByClient.get(c.id) ?? 0;
    const paymentsPaid = paymentsOutByClient.get(c.id) ?? 0;
    return {
      clientId: c.id,
      clientName: c.name,
      ordersCount: c.orders.length,
      orderTotal,
      avgOrderValue: c.orders.length ? orderTotal / c.orders.length : 0,
      paymentsReceived,
      receivable: orderTotal - paymentsReceived,
      purchaseOrdersCount: c.purchaseOrders.length,
      purchaseTotal,
      paymentsPaid,
      payable: purchaseTotal - paymentsPaid,
    };
  });
}

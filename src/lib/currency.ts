import { prisma } from "@/lib/prisma";

/**
 * Latest rate on record per currency. Still used as the fallback for rows
 * that have no rateSnapshot (pre-Block-M2 history, or currency ==
 * baseCurrency so no rate was ever needed) — see toBase below.
 */
export async function getLatestRates(orgId: string): Promise<Map<string, number>> {
  const rates = await prisma.exchangeRate.findMany({
    where: { orgId },
    orderBy: { effectiveAt: "desc" },
  });
  const map = new Map<string, number>();
  for (const rate of rates) {
    if (!map.has(rate.currency)) {
      map.set(rate.currency, Number(rate.rateToBase));
    }
  }
  return map;
}

export async function getOrgBaseCurrency(orgId: string): Promise<string> {
  const org = await prisma.organization.findUniqueOrThrow({
    where: { id: orgId },
    select: { baseCurrency: true },
  });
  return org.baseCurrency;
}

/**
 * Block M2: the rate that was actually in effect for `currency` at `at` —
 * the latest ExchangeRate with effectiveAt <= at, or (if the operation
 * predates every recorded rate for that currency) the latest one on record
 * at all. Called once at write time by each action that snapshots a
 * rateSnapshot (Payment, StockMovementLine, StockBatch) — never at read
 * time, so a later rate change can't retroactively reprice an
 * already-posted document.
 */
export async function getRateAt(orgId: string, currency: string, at: Date): Promise<number | null> {
  const before = await prisma.exchangeRate.findFirst({
    where: { orgId, currency, effectiveAt: { lte: at } },
    orderBy: { effectiveAt: "desc" },
  });
  if (before) return Number(before.rateToBase);

  const any = await prisma.exchangeRate.findFirst({
    where: { orgId, currency },
    orderBy: { effectiveAt: "desc" },
  });
  return any ? Number(any.rateToBase) : null;
}

/** Converts `amount` in `currency` to the org's base currency. `rateSnapshot`
 * (Block M2), when given, is the rate captured at posting time — preferred
 * over `rates` (today's latest) so historical documents don't silently
 * reprice when the org's exchange rate changes later. Falls back to the raw
 * amount (rate 1) when neither a snapshot nor a current rate is on file —
 * better to show an un-converted number than to silently drop it from a
 * total. */
export function toBase(
  rates: Map<string, number>,
  baseCurrency: string,
  amount: number,
  currency: string,
  rateSnapshot?: number | null,
): number {
  if (currency === baseCurrency) return amount;
  const rate = rateSnapshot ?? rates.get(currency);
  return rate ? amount * rate : amount;
}

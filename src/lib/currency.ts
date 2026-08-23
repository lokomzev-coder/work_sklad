import { prisma } from "@/lib/prisma";

/**
 * Latest rate on record per currency — NOT a point-in-time historical
 * lookup. `ExchangeRate.effectiveAt` exists so an org can log rate changes
 * over time, but every report below converts everything using the most
 * recent rate, same spirit as the rest of this MVP's money handling (no
 * partition-accurate historical costing anywhere else either — see
 * getPnlReport's own comment). Good enough to make totals additive across
 * currencies; not a real historical FX ledger.
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

/** Converts `amount` in `currency` to the org's base currency. Falls back to
 * the raw amount (rate 1) when no rate is on file — better to show an
 * un-converted number than to silently drop it from a total. */
export function toBase(
  rates: Map<string, number>,
  baseCurrency: string,
  amount: number,
  currency: string,
): number {
  if (currency === baseCurrency) return amount;
  const rate = rates.get(currency);
  return rate ? amount * rate : amount;
}

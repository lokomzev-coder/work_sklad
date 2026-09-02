import { prisma } from "@/lib/prisma";

export interface MaterialCostLookup {
  unitCost: number;
  hasHistory: boolean;
}

/**
 * Production material costing deliberately still uses last-known purchase
 * price, not FIFO — Block M1 added FIFO batch costing to P&L's DEMAND
 * (sales) side only, not to raw-material consumption here (a separate,
 * not-yet-requested scope). A raw material's cost for production is its
 * last known purchase price: the most recent SUPPLY movement's
 * unitPriceSnapshot for that item, org-wide (not store-scoped). Items never
 * purchased have no cost history — callers surface that as a warning rather
 * than silently costing them at 0. This same function is also reused as
 * getPnlReport's fallback price for any DEMAND quantity that FIFO batches
 * couldn't cover (see lib/reports.ts).
 */
export async function getLastPurchaseUnitCosts(
  orgId: string,
  catalogItemIds: string[],
): Promise<Map<string, MaterialCostLookup>> {
  const uniqueIds = [...new Set(catalogItemIds)];
  const results = await Promise.all(
    uniqueIds.map(async (catalogItemId) => {
      const line = await prisma.stockMovementLine.findFirst({
        where: { catalogItemId, movement: { orgId, type: "SUPPLY" } },
        orderBy: { movement: { createdAt: "desc" } },
        select: { unitPriceSnapshot: true },
      });
      const lookup: MaterialCostLookup =
        line?.unitPriceSnapshot != null
          ? { unitCost: Number(line.unitPriceSnapshot), hasHistory: true }
          : { unitCost: 0, hasHistory: false };
      return [catalogItemId, lookup] as const;
    }),
  );
  return new Map(results);
}

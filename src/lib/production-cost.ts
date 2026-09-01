import { prisma } from "@/lib/prisma";

export interface MaterialCostLookup {
  unitCost: number;
  hasHistory: boolean;
}

/**
 * The project doesn't do FIFO/weighted-average costing anywhere (see P&L's
 * documented simplification) — consistent with that, a raw material's cost
 * for production is its last known purchase price: the most recent SUPPLY
 * movement's unitPriceSnapshot for that item, org-wide (not store-scoped).
 * Items never purchased have no cost history — callers surface that as a
 * warning rather than silently costing them at 0.
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

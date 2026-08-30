import { prisma } from "@/lib/prisma";
import { Prisma } from "@/generated/prisma/client";

export { STOCK_MOVEMENT_TYPE_LABELS } from "@/lib/stock-labels";

export interface StockBalanceRow {
  catalogItemId: string;
  catalogItemName: string;
  storeId: string;
  storeName: string;
  quantity: string;
}

/**
 * Stock is never a stored, mutable number — it's always derived from the
 * StockMovementLine ledger: ENTER/INVENTORY/SUPPLY/SALES_RETURN/
 * PRODUCTION_OUTPUT lines add `quantity` to storeId, LOSS/MOVE/DEMAND/
 * PURCHASE_RETURN/PRODUCTION_CONSUME subtract it from storeId, and MOVE
 * additionally adds it to toStoreId. Computing it on the fly means it can
 * never drift from its own history (see the schema comment above the Store
 * model).
 */
export async function getStockBalances(
  orgId: string,
  filters: { storeId?: string; catalogItemId?: string } = {},
): Promise<StockBalanceRow[]> {
  const storeFilter = filters.storeId
    ? Prisma.sql`AND s.id = ${filters.storeId}`
    : Prisma.empty;
  const itemFilter = filters.catalogItemId
    ? Prisma.sql`AND ci.id = ${filters.catalogItemId}`
    : Prisma.empty;

  const rows = await prisma.$queryRaw<StockBalanceRow[]>(Prisma.sql`
    WITH deltas AS (
      SELECT sm."storeId" AS "storeId", l."catalogItemId" AS "catalogItemId",
        CASE WHEN sm.type IN ('ENTER', 'INVENTORY', 'SUPPLY', 'SALES_RETURN', 'PRODUCTION_OUTPUT') THEN l.quantity ELSE -l.quantity END AS delta
      FROM "StockMovementLine" l
      JOIN "StockMovement" sm ON sm.id = l."movementId"
      WHERE sm."orgId" = ${orgId}
      UNION ALL
      SELECT sm."toStoreId" AS "storeId", l."catalogItemId" AS "catalogItemId", l.quantity AS delta
      FROM "StockMovementLine" l
      JOIN "StockMovement" sm ON sm.id = l."movementId"
      WHERE sm."orgId" = ${orgId} AND sm.type = 'MOVE'
    )
    SELECT ci.id AS "catalogItemId", ci.name AS "catalogItemName",
      s.id AS "storeId", s.name AS "storeName",
      SUM(d.delta)::text AS quantity
    FROM deltas d
    JOIN "Store" s ON s.id = d."storeId"
    JOIN "CatalogItem" ci ON ci.id = d."catalogItemId"
    WHERE 1=1 ${storeFilter} ${itemFilter}
    GROUP BY ci.id, ci.name, s.id, s.name
    HAVING SUM(d.delta) <> 0
    ORDER BY s.name, ci.name
  `);

  return rows;
}

/** Current balance of a single item at a single store, used to compute the
 * signed delta for a new INVENTORY line at posting time. */
export async function getItemBalanceAtStore(
  orgId: string,
  storeId: string,
  catalogItemId: string,
): Promise<number> {
  const rows = await getStockBalances(orgId, { storeId, catalogItemId });
  return rows[0] ? Number(rows[0].quantity) : 0;
}

export interface BundleStockRow {
  catalogItemId: string;
  catalogItemName: string;
  storeId: string;
  storeName: string;
  quantity: string;
}

/**
 * BUNDLE items have no ledger of their own (ROADMAP Block B) — "how many can
 * I assemble" is derived from component stock: at each store, it's the
 * minimum across all components of floor(component balance / qty needed per
 * bundle). Zero-quantity results are omitted, same convention as
 * getStockBalances (a bundle you can't currently assemble anywhere isn't
 * worth a zero row).
 */
export async function getBundleStockBalances(orgId: string): Promise<BundleStockRow[]> {
  const bundles = await prisma.catalogItem.findMany({
    where: { orgId, type: "BUNDLE", status: "ACTIVE" },
    include: { bundleComponents: true },
  });
  if (bundles.length === 0) return [];

  const componentIds = new Set(bundles.flatMap((b) => b.bundleComponents.map((c) => c.componentId)));
  if (componentIds.size === 0) return [];

  const [balances, stores] = await Promise.all([
    getStockBalances(orgId),
    prisma.store.findMany({ where: { orgId, status: "ACTIVE" } }),
  ]);

  const balanceByItemAndStore = new Map<string, Map<string, number>>();
  for (const row of balances) {
    if (!componentIds.has(row.catalogItemId)) continue;
    let byStore = balanceByItemAndStore.get(row.catalogItemId);
    if (!byStore) {
      byStore = new Map();
      balanceByItemAndStore.set(row.catalogItemId, byStore);
    }
    byStore.set(row.storeId, Number(row.quantity));
  }

  const result: BundleStockRow[] = [];
  for (const bundle of bundles) {
    if (bundle.bundleComponents.length === 0) continue;
    for (const store of stores) {
      let available = Infinity;
      for (const component of bundle.bundleComponents) {
        const componentBalance = balanceByItemAndStore.get(component.componentId)?.get(store.id) ?? 0;
        const needed = Number(component.quantity);
        const possible = needed > 0 ? Math.floor(componentBalance / needed) : 0;
        available = Math.min(available, possible);
      }
      if (available > 0 && Number.isFinite(available)) {
        result.push({
          catalogItemId: bundle.id,
          catalogItemName: bundle.name,
          storeId: store.id,
          storeName: store.name,
          quantity: String(available),
        });
      }
    }
  }
  return result;
}

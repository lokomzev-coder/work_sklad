import { prisma } from "@/lib/prisma";
import { Prisma } from "@/generated/prisma/client";

export interface StockBalanceRow {
  catalogItemId: string;
  catalogItemName: string;
  storeId: string;
  storeName: string;
  quantity: string;
}

/**
 * Stock is never a stored, mutable number — it's always derived from the
 * StockMovementLine ledger: ENTER/INVENTORY/SUPPLY/SALES_RETURN lines add
 * `quantity` to storeId, LOSS/MOVE/DEMAND/PURCHASE_RETURN subtract it from
 * storeId, and MOVE additionally adds it to toStoreId. Computing it on the
 * fly means it can never drift from its own history (see the schema comment
 * above the Store model).
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
        CASE WHEN sm.type IN ('ENTER', 'INVENTORY', 'SUPPLY', 'SALES_RETURN') THEN l.quantity ELSE -l.quantity END AS delta
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

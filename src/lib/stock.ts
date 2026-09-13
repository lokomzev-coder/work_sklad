import { prisma } from "@/lib/prisma";
import { Prisma } from "@/generated/prisma/client";
import { variantLabel } from "@/lib/catalog-variants";
import { lineKey } from "@/lib/orders";

export { STOCK_MOVEMENT_TYPE_LABELS } from "@/lib/stock-labels";

export interface StockBalanceRow {
  catalogItemId: string;
  catalogItemName: string;
  storeId: string;
  storeName: string;
  quantity: string;
  // Block M6: only populated when `byVariant` is requested — see below.
  variantId: string | null;
  variantLabel: string | null;
}

/**
 * Stock is never a stored, mutable number — it's always derived from the
 * StockMovementLine ledger: ENTER/INVENTORY/SUPPLY/SALES_RETURN/
 * PRODUCTION_OUTPUT/RETAIL_RETURN lines add `quantity` to storeId, LOSS/
 * MOVE/DEMAND/PURCHASE_RETURN/PRODUCTION_CONSUME/RETAIL_SALE subtract it
 * from storeId, and MOVE additionally adds it to toStoreId. Computing it on
 * the fly means it can never drift from its own history (see the schema
 * comment above the Store model).
 *
 * Block M6: pass `byVariant: true` to group by (item, variant, store)
 * instead of just (item, store) — variantId is then either a real variant id
 * or null (items with no variants, or ledger lines with no variant, e.g.
 * production or pre-M6 history). Without `byVariant`, behavior is unchanged
 * from before M6 — variant is never selected out, so rows collapse to one
 * per (item, store) exactly as before, and `variantId`/`variantLabel` are
 * always null. Callers that don't care about variants (getBundleStockBalances,
 * production/floor material-shortage checks) intentionally never pass it.
 *
 * "Создать документ" flow: only filters to `sm."isPosted" = true` — a draft
 * DEMAND movement (created but not yet finalized via
 * actions/fulfillment.ts::postDraftDemand) must have zero effect on stock
 * until posted. Every other movement type/path defaults `isPosted` to true
 * at creation, so this filter is a no-op for them.
 */
export async function getStockBalances(
  orgId: string,
  filters: {
    storeId?: string;
    catalogItemId?: string;
    // null = "only lines with no variant"; a string = that exact variant;
    // undefined = no variant filter at all.
    variantId?: string | null;
    byVariant?: boolean;
  } = {},
): Promise<StockBalanceRow[]> {
  const storeFilter = filters.storeId
    ? Prisma.sql`AND s.id = ${filters.storeId}`
    : Prisma.empty;
  const itemFilter = filters.catalogItemId
    ? Prisma.sql`AND ci.id = ${filters.catalogItemId}`
    : Prisma.empty;
  // NULL-safety: `d."variantId" = ${null}` is never true in SQL, so an
  // explicit-null filter ("only unvariant lines") needs its own IS NULL
  // branch, distinct from "no filter at all" (undefined).
  const variantFilter =
    filters.variantId === null
      ? Prisma.sql`AND d."variantId" IS NULL`
      : filters.variantId
        ? Prisma.sql`AND d."variantId" = ${filters.variantId}`
        : Prisma.empty;
  const groupByVariant = filters.byVariant ? Prisma.sql`, d."variantId"` : Prisma.empty;
  const selectVariant = filters.byVariant
    ? Prisma.sql`d."variantId" AS "variantId",`
    : Prisma.sql`NULL::text AS "variantId",`;

  const rows = await prisma.$queryRaw<Omit<StockBalanceRow, "variantLabel">[]>(Prisma.sql`
    WITH deltas AS (
      SELECT sm."storeId" AS "storeId", l."catalogItemId" AS "catalogItemId", l."variantId" AS "variantId",
        CASE WHEN sm.type IN ('ENTER', 'INVENTORY', 'SUPPLY', 'SALES_RETURN', 'PRODUCTION_OUTPUT', 'RETAIL_RETURN') THEN l.quantity ELSE -l.quantity END AS delta
      FROM "StockMovementLine" l
      JOIN "StockMovement" sm ON sm.id = l."movementId"
      WHERE sm."orgId" = ${orgId} AND sm."isPosted" = true
      UNION ALL
      SELECT sm."toStoreId" AS "storeId", l."catalogItemId" AS "catalogItemId", l."variantId" AS "variantId", l.quantity AS delta
      FROM "StockMovementLine" l
      JOIN "StockMovement" sm ON sm.id = l."movementId"
      WHERE sm."orgId" = ${orgId} AND sm.type = 'MOVE' AND sm."isPosted" = true
    )
    SELECT ci.id AS "catalogItemId", ci.name AS "catalogItemName",
      s.id AS "storeId", s.name AS "storeName",
      ${selectVariant}
      SUM(d.delta)::text AS quantity
    FROM deltas d
    JOIN "Store" s ON s.id = d."storeId"
    JOIN "CatalogItem" ci ON ci.id = d."catalogItemId"
    WHERE 1=1 ${storeFilter} ${itemFilter} ${variantFilter}
    GROUP BY ci.id, ci.name, s.id, s.name ${groupByVariant}
    HAVING SUM(d.delta) <> 0
    ORDER BY s.name, ci.name${filters.byVariant ? Prisma.sql`, d."variantId"` : Prisma.empty}
  `);

  if (!filters.byVariant) {
    return rows.map((r) => ({ ...r, variantId: null, variantLabel: null }));
  }

  const variantIds = [...new Set(rows.map((r) => r.variantId).filter((v): v is string => v !== null))];
  const variantLabels = new Map<string, string>();
  if (variantIds.length > 0) {
    const variants = await prisma.catalogItemVariant.findMany({
      where: { id: { in: variantIds } },
      include: { values: { include: { characteristic: true } } },
    });
    for (const v of variants) variantLabels.set(v.id, variantLabel(v.values));
  }

  return rows.map((r) => ({
    ...r,
    variantLabel: r.variantId ? (variantLabels.get(r.variantId) ?? null) : null,
  }));
}

/** Current balance of a single item (optionally a single variant) at a
 * single store, used to compute the signed delta for a new INVENTORY line
 * at posting time. */
export async function getItemBalanceAtStore(
  orgId: string,
  storeId: string,
  catalogItemId: string,
  variantId?: string | null,
): Promise<number> {
  const rows = await getStockBalances(orgId, {
    storeId,
    catalogItemId,
    variantId,
    byVariant: variantId !== undefined,
  });
  return rows[0] ? Number(rows[0].quantity) : 0;
}

/**
 * Order redesign: total quantity reserved (StockReservation) per (item,
 * variant) at a store, across all orders — or all EXCEPT one, when
 * `excludeOrderId` is passed (an order's own reservation must never block
 * its own shipment). Plain Prisma `groupBy`, not raw SQL — reservations have
 * no signed-bucket/CASE-WHEN complexity like getStockBalances.
 */
export async function getReservedQuantitiesByStore(
  orgId: string,
  storeId: string,
  excludeOrderId?: string,
): Promise<Map<string, number>> {
  const rows = await prisma.stockReservation.groupBy({
    by: ["catalogItemId", "variantId"],
    where: {
      orgId,
      storeId,
      ...(excludeOrderId ? { orderId: { not: excludeOrderId } } : {}),
    },
    _sum: { quantity: true },
  });
  return new Map(
    rows.map((row) => [lineKey(row.catalogItemId, row.variantId), Number(row._sum.quantity ?? 0)]),
  );
}

/**
 * Order redesign: like getReservedQuantitiesByStore, but across every store
 * at once — for the /warehouse/stock report's "Резерв"/"Доступно" columns,
 * which list balances for all stores in one table rather than one store at
 * a time. Keyed by storeId + lineKey since the same item can be reserved
 * independently at different stores.
 */
export async function getAllReservedQuantities(orgId: string): Promise<Map<string, number>> {
  const rows = await prisma.stockReservation.groupBy({
    by: ["storeId", "catalogItemId", "variantId"],
    where: { orgId },
    _sum: { quantity: true },
  });
  return new Map(
    rows.map((row) => [`${row.storeId}:${lineKey(row.catalogItemId, row.variantId)}`, Number(row._sum.quantity ?? 0)]),
  );
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

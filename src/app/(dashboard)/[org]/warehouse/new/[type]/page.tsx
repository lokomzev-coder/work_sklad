import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getOrgContext } from "@/lib/tenant";
import { assertPermission, can } from "@/lib/permissions";
import { getStockBalances } from "@/lib/stock";
import { variantLabel } from "@/lib/catalog-variants";
import { MovementForm, type ManualMovementType } from "@/components/warehouse/movement-form";

const TYPES: Record<string, ManualMovementType> = {
  enter: "ENTER",
  loss: "LOSS",
  move: "MOVE",
  inventory: "INVENTORY",
};

const TITLE: Record<ManualMovementType, string> = {
  ENTER: "Новое оприходование",
  LOSS: "Новое списание",
  MOVE: "Новое перемещение",
  INVENTORY: "Новая инвентаризация",
};

export default async function NewMovementPage({
  params,
}: {
  params: Promise<{ org: string; type: string }>;
}) {
  const { org, type: typeParam } = await params;
  const type = TYPES[typeParam];
  if (!type) {
    notFound();
  }

  const ctx = await getOrgContext(org);
  if (!can(ctx, "warehouse", "view")) notFound();
  assertPermission(ctx, "warehouse", "create");

  const [stores, catalogItems, balances] = await Promise.all([
    prisma.store.findMany({ where: { orgId: ctx.orgId, status: "ACTIVE" }, orderBy: { name: "asc" } }),
    // Only PRODUCT has its own physical stock — SERVICE isn't a physical
    // good, and BUNDLE's "availability" is derived from its components'
    // stock, not tracked as its own ledger line.
    prisma.catalogItem.findMany({
      where: { orgId: ctx.orgId, status: "ACTIVE", type: "PRODUCT" },
      orderBy: { name: "asc" },
      include: {
        variants: {
          where: { status: "ACTIVE" },
          include: { values: { include: { characteristic: true } } },
        },
      },
    }),
    getStockBalances(ctx.orgId, { byVariant: true }),
  ]);

  const balanceMap: Record<string, Record<string, number>> = {};
  for (const row of balances) {
    balanceMap[row.storeId] ??= {};
    balanceMap[row.storeId][`${row.catalogItemId}:${row.variantId ?? ""}`] = Number(row.quantity);
  }

  return (
    <div className="flex max-w-2xl flex-col gap-4">
      <h1 className="text-2xl font-semibold">{TITLE[type]}</h1>
      <MovementForm
        orgSlug={org}
        type={type}
        storeOptions={stores.map((s) => ({ value: s.id, label: s.name }))}
        defaultStoreId={ctx.defaultStoreId}
        catalogOptions={catalogItems.map((c) => ({
          id: c.id,
          name: c.name,
          variants: c.variants.map((v) => ({
            id: v.id,
            label: variantLabel(v.values) || (v.sku ?? v.id),
          })),
        }))}
        balances={balanceMap}
      />
    </div>
  );
}

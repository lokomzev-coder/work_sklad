import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getOrgContext } from "@/lib/tenant";
import { assertPermission } from "@/lib/permissions";
import { getStockBalances } from "@/lib/stock";
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
  assertPermission(ctx.role, "warehouse", "edit");

  const [stores, catalogItems, balances] = await Promise.all([
    prisma.store.findMany({ where: { orgId: ctx.orgId, status: "ACTIVE" }, orderBy: { name: "asc" } }),
    // Only PRODUCT has its own physical stock — SERVICE isn't a physical
    // good, and BUNDLE's "availability" is derived from its components'
    // stock, not tracked as its own ledger line.
    prisma.catalogItem.findMany({
      where: { orgId: ctx.orgId, status: "ACTIVE", type: "PRODUCT" },
      orderBy: { name: "asc" },
    }),
    getStockBalances(ctx.orgId),
  ]);

  const balanceMap: Record<string, Record<string, number>> = {};
  for (const row of balances) {
    balanceMap[row.storeId] ??= {};
    balanceMap[row.storeId][row.catalogItemId] = Number(row.quantity);
  }

  return (
    <div className="flex max-w-2xl flex-col gap-4">
      <h1 className="text-2xl font-semibold">{TITLE[type]}</h1>
      <MovementForm
        orgSlug={org}
        type={type}
        storeOptions={stores.map((s) => ({ value: s.id, label: s.name }))}
        catalogOptions={catalogItems.map((c) => ({ value: c.id, label: c.name }))}
        balances={balanceMap}
      />
    </div>
  );
}

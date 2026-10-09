import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getOrgContext } from "@/lib/tenant";
import { can } from "@/lib/permissions";
import { variantLabel } from "@/lib/catalog-variants";
import { PrintDocument } from "@/components/print/print-document";

const TITLE: Record<string, string> = {
  ENTER: "Оприходование",
  LOSS: "Списание",
  MOVE: "Перемещение",
  INVENTORY: "Инвентаризация",
};

// Block U (explicit request, 2026-09-21) — print form for the four manual
// warehouse documents (movement-form.tsx). Deliberately no prices column at
// all: StockMovementLine.unitPriceSnapshot is null for every one of these
// types (see the schema comment on that field) — this is not the same
// "hide prices" toggle other document prints have, there is no price to
// show or hide here.
export default async function PrintStockMovementPage({
  params,
}: {
  params: Promise<{ org: string; id: string }>;
}) {
  const { org, id } = await params;
  const ctx = await getOrgContext(org);
  if (!can(ctx, "warehouse", "view")) notFound();

  const movement = await prisma.stockMovement.findFirst({
    where: { id, orgId: ctx.orgId },
    include: {
      store: true,
      toStore: true,
      lines: {
        include: {
          catalogItem: { include: { unit: true } },
          variant: { include: { values: { include: { characteristic: true } } } },
        },
      },
    },
  });
  if (!movement) notFound();
  if (!TITLE[movement.type]) {
    // DEMAND/SUPPLY/etc. already have their own print forms (orders/
    // purchase-orders) — this route only serves the four manual types.
    notFound();
  }

  const defaultLegalEntity = await prisma.legalEntity.findFirst({
    where: { orgId: ctx.orgId, isDefault: true, status: "ACTIVE" },
  });

  const storeLabel =
    movement.type === "MOVE" ? `${movement.store.name} → ${movement.toStore?.name ?? "—"}` : movement.store.name;

  return (
    <PrintDocument
      title={`${TITLE[movement.type]} №${movement.number} от ${movement.createdAt.toLocaleDateString("ru-RU")}`}
      issuer={
        defaultLegalEntity
          ? {
              name: defaultLegalEntity.name,
              inn: defaultLegalEntity.inn,
              kpp: defaultLegalEntity.kpp,
              ogrn: defaultLegalEntity.ogrn,
              address: defaultLegalEntity.address,
              bankName: defaultLegalEntity.bankName,
              bankBik: defaultLegalEntity.bankBik,
              bankAccount: defaultLegalEntity.bankAccount,
            }
          : { name: ctx.orgName }
      }
      counterpartyLabel="Склад"
      counterparty={{ name: storeLabel }}
      lines={movement.lines.map((line) => ({
        name:
          line.catalogItem.name +
          (line.variant ? ` — ${variantLabel(line.variant.values) || (line.variant.sku ?? line.variant.id)}` : ""),
        quantity: (movement.type === "INVENTORY" ? (line.countedQuantity ?? line.quantity) : line.quantity).toString(),
        unit: line.catalogItem.unit?.shortName ?? "—",
        price: "",
        sum: "",
      }))}
      total=""
      currency=""
      showPrices={false}
    />
  );
}

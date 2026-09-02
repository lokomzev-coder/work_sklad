import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getOrgContext } from "@/lib/tenant";
import { can } from "@/lib/permissions";
import { isRowVisible } from "@/lib/scope";
import { PrintLabels, type LabelItem } from "@/components/print/print-labels";
import { variantLabel } from "@/lib/catalog-variants";

export default async function PrintOrderLabelsPage({
  params,
  searchParams,
}: {
  params: Promise<{ org: string; id: string }>;
  searchParams: Promise<{ mode?: string; prices?: string }>;
}) {
  const { org, id } = await params;
  const { mode, prices } = await searchParams;
  const ctx = await getOrgContext(org);
  if (!can(ctx, "orders", "view")) notFound();

  const order = await prisma.order.findFirst({
    where: { id, orgId: ctx.orgId },
    include: {
      lineItems: {
        include: {
          catalogItem: true,
          variant: { include: { values: { include: { characteristic: true } } } },
        },
      },
    },
  });
  if (!order) notFound();
  if (!(await isRowVisible(ctx, "orders", order.assignedEmployeeId))) notFound();

  // Block M4: "unit" = one label per unit of quantity, "line" = one label
  // per distinct line item regardless of quantity. Bad/missing mode
  // defaults to "unit", same non-fatal-default treatment as `prices`.
  const quantityMode = mode === "line" ? "line" : "unit";
  const showPrices = prices !== "0";

  const items: LabelItem[] = order.lineItems
    .filter((li) => li.catalogItem.type === "PRODUCT")
    .map((li) => {
      const name = li.variant
        ? `${li.catalogItem.name} — ${variantLabel(li.variant.values)}`
        : li.catalogItem.name;
      // A variant's own barcode identifies the specific size/color being
      // labeled — falling back to the parent item's barcode would put the
      // wrong identity on a variant's physical label.
      const barcode = li.variant?.barcode ?? li.catalogItem.barcode;
      const copies = quantityMode === "unit" ? Math.max(1, Math.round(Number(li.quantity))) : 1;
      return {
        name,
        barcode,
        price: Number(li.unitPriceSnapshot).toFixed(2),
        currency: li.currency,
        copies,
      };
    });

  return <PrintLabels title={`Этикетки — заказ №${order.number}`} items={items} showPrices={showPrices} />;
}

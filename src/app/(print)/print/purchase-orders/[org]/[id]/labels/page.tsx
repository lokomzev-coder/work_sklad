import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getOrgContext } from "@/lib/tenant";
import { can } from "@/lib/permissions";
import { isRowVisible } from "@/lib/scope";
import { PrintLabels, type LabelItem } from "@/components/print/print-labels";

export default async function PrintPurchaseOrderLabelsPage({
  params,
  searchParams,
}: {
  params: Promise<{ org: string; id: string }>;
  searchParams: Promise<{ mode?: string; prices?: string }>;
}) {
  const { org, id } = await params;
  const { mode, prices } = await searchParams;
  const ctx = await getOrgContext(org);
  if (!can(ctx, "purchaseOrders", "view")) notFound();

  const purchaseOrder = await prisma.purchaseOrder.findFirst({
    where: { id, orgId: ctx.orgId },
    include: { lineItems: { include: { catalogItem: true } } },
  });
  if (!purchaseOrder) notFound();
  if (!(await isRowVisible(ctx, "purchaseOrders", purchaseOrder.assignedEmployeeId))) notFound();

  // Block M4: same two modes as order labels — no variant concept on
  // PurchaseOrderLineItem (POs don't support variants), so no lookup needed.
  const quantityMode = mode === "line" ? "line" : "unit";
  const showPrices = prices !== "0";

  const items: LabelItem[] = purchaseOrder.lineItems
    .filter((li) => li.catalogItem.type === "PRODUCT")
    .map((li) => {
      const copies = quantityMode === "unit" ? Math.max(1, Math.round(Number(li.quantity))) : 1;
      return {
        name: li.catalogItem.name,
        barcode: li.catalogItem.barcode,
        price: Number(li.unitPriceSnapshot).toFixed(2),
        currency: li.currency,
        copies,
      };
    });

  return (
    <PrintLabels title={`Этикетки — заказ поставщику №${purchaseOrder.number}`} items={items} showPrices={showPrices} />
  );
}

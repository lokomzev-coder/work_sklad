import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getOrgContext } from "@/lib/tenant";
import { can } from "@/lib/permissions";
import { parseLabelElements } from "@/lib/label-template";
import { formatMoney } from "@/lib/format";
import { TemplateLabelRenderer, type LabelPrintItem } from "@/components/print/template-label-renderer";

export default async function PrintCatalogLabelsPage({
  params,
  searchParams,
}: {
  params: Promise<{ org: string }>;
  searchParams: Promise<{ items?: string; templateId?: string; copies?: string; packagingId?: string }>;
}) {
  const { org } = await params;
  const { items: itemsParam, templateId, copies: copiesParam, packagingId } = await searchParams;
  const ctx = await getOrgContext(org);
  if (!can(ctx, "catalog", "view")) notFound();

  const itemIds = (itemsParam ?? "").split(",").filter(Boolean);
  const copies = Math.max(1, Number(copiesParam) || 1);
  if (itemIds.length === 0 || !templateId) notFound();

  const template = await prisma.labelTemplate.findFirst({ where: { id: templateId, orgId: ctx.orgId } });
  if (!template) notFound();

  const catalogItems = await prisma.catalogItem.findMany({
    where: { id: { in: itemIds }, orgId: ctx.orgId },
  });
  if (catalogItems.length === 0) notFound();

  // Single-item + packagingId means "print THIS packaging's own barcode",
  // not the item's own — everything else (name/sku/price) still comes from
  // the parent item, packaging has no name/sku/price fields of its own.
  let packagingBarcode: string | null = null;
  if (packagingId && itemIds.length === 1) {
    const packaging = await prisma.catalogItemPackaging.findFirst({
      where: { id: packagingId, catalogItemId: itemIds[0] },
    });
    if (!packaging) notFound();
    packagingBarcode = packaging.barcode;
  }

  const printItems: LabelPrintItem[] = catalogItems.map((item) => ({
    key: item.id,
    name: item.name,
    sku: item.sku,
    price: formatMoney(Number(item.unitPrice), item.currency),
    barcode: packagingId ? packagingBarcode : item.barcode,
    copies,
  }));

  return (
    <TemplateLabelRenderer
      widthMm={template.widthMm}
      heightMm={template.heightMm}
      elements={parseLabelElements(template.elements)}
      items={printItems}
    />
  );
}

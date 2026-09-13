import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getOrgContext } from "@/lib/tenant";
import { flattenGroupTree } from "@/lib/catalog-groups";
import { updateCatalogItem } from "@/actions/catalog";
import { CatalogItemForm } from "@/components/catalog/catalog-item-form";
import { BundleComponentsEditor } from "@/components/catalog/bundle-components-editor";
import { VariantsEditor } from "@/components/catalog/variants-editor";
import { PackagingsEditor } from "@/components/catalog/packagings-editor";
import { CatalogLabelPrintDialog } from "@/components/catalog/catalog-label-print-dialog";
import { CatalogItemPricesEditor } from "@/components/catalog/catalog-item-prices-editor";
import { variantLabel } from "@/lib/catalog-variants";
import { getStockBalances } from "@/lib/stock";
import { listCustomFieldDefinitions, getCustomFieldValues } from "@/lib/custom-fields";
import { listAttachments } from "@/lib/attachments";
import { AttachmentList } from "@/components/attachments/attachment-list";

export default async function EditCatalogItemPage({
  params,
}: {
  params: Promise<{ org: string; id: string }>;
}) {
  const { org, id } = await params;
  const ctx = await getOrgContext(org);

  const item = await prisma.catalogItem.findFirst({
    where: { id, orgId: ctx.orgId },
  });

  if (!item) {
    notFound();
  }

  const [units, groups, customFieldDefs, customFieldValues, priceTypes, itemPrices, packagingTypes, packagings, labelTemplates] =
    await Promise.all([
      prisma.unit.findMany({ where: { orgId: ctx.orgId }, orderBy: { name: "asc" } }),
      prisma.catalogGroup.findMany({ where: { orgId: ctx.orgId }, orderBy: { name: "asc" } }),
      listCustomFieldDefinitions(ctx.orgId, "CATALOG_ITEM"),
      getCustomFieldValues(item.id),
      prisma.priceType.findMany({ where: { orgId: ctx.orgId }, orderBy: { name: "asc" } }),
      prisma.catalogItemPrice.findMany({ where: { catalogItemId: item.id } }),
      prisma.packagingType.findMany({ where: { orgId: ctx.orgId }, orderBy: { name: "asc" } }),
      prisma.catalogItemPackaging.findMany({
        where: { catalogItemId: item.id },
        include: { packagingType: true, unit: true },
        orderBy: { createdAt: "asc" },
      }),
      prisma.labelTemplate.findMany({ where: { orgId: ctx.orgId }, orderBy: { name: "asc" } }),
    ]);
  const images = await listAttachments(ctx.orgId, "CatalogItem", item.id);
  const priceByTypeId = new Map(itemPrices.map((p) => [p.priceTypeId, p.value.toString()]));

  const boundAction = updateCatalogItem.bind(null, org, item.id);

  let bundleComponentOptions: { value: string; label: string }[] = [];
  let bundleDefaultComponents: { componentId: string; quantity: string }[] = [];
  if (item.type === "BUNDLE") {
    const [nonBundleItems, existingComponents] = await Promise.all([
      prisma.catalogItem.findMany({
        where: { orgId: ctx.orgId, type: { not: "BUNDLE" }, id: { not: item.id } },
        orderBy: { name: "asc" },
      }),
      prisma.catalogItemComponent.findMany({ where: { bundleId: item.id } }),
    ]);
    bundleComponentOptions = nonBundleItems.map((c) => ({
      value: c.id,
      label: `${c.name} — ${c.unitPrice.toString()} ${c.currency}`,
    }));
    bundleDefaultComponents = existingComponents.map((c) => ({
      componentId: c.componentId,
      quantity: c.quantity.toString(),
    }));
  }

  let characteristics: { id: string; name: string }[] = [];
  let variantRows: {
    id: string;
    label: string;
    sku: string | null;
    barcode: string | null;
    priceOverride: string | null;
    stock: number;
  }[] = [];
  if (item.type === "PRODUCT") {
    const [orgCharacteristics, existingVariants, balances] = await Promise.all([
      prisma.characteristic.findMany({ where: { orgId: ctx.orgId }, orderBy: { name: "asc" } }),
      prisma.catalogItemVariant.findMany({
        where: { catalogItemId: item.id, status: "ACTIVE" },
        include: { values: { include: { characteristic: true } } },
        orderBy: { createdAt: "asc" },
      }),
      // Block M6: summed across stores for a quick per-variant reference on
      // the catalog page — the item never showed stock at any level before,
      // so this is a small added convenience, not a doubled-up query path.
      getStockBalances(ctx.orgId, { catalogItemId: item.id, byVariant: true }),
    ]);
    characteristics = orgCharacteristics.map((c) => ({ id: c.id, name: c.name }));
    const stockByVariant = new Map<string, number>();
    for (const row of balances) {
      if (!row.variantId) continue;
      stockByVariant.set(row.variantId, (stockByVariant.get(row.variantId) ?? 0) + Number(row.quantity));
    }
    variantRows = existingVariants.map((v) => ({
      id: v.id,
      label: variantLabel(v.values),
      sku: v.sku,
      barcode: v.barcode,
      priceOverride: v.priceOverride?.toString() ?? null,
      stock: stockByVariant.get(v.id) ?? 0,
    }));
  }

  return (
    <div className="flex max-w-lg flex-col gap-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">{item.name}</h1>
        <CatalogLabelPrintDialog
          orgSlug={org}
          itemIds={[item.id]}
          templates={labelTemplates.map((t) => ({ id: t.id, name: t.name }))}
          packagingOptions={packagings.map((p) => ({
            id: p.id,
            label: `${p.packagingType.name} — ${p.quantity.toString()}${p.unit ? ` ${p.unit.shortName}` : ""}`,
          }))}
          openPdfInBrowser={ctx.openPdfInBrowser}
        />
      </div>
      <CatalogItemForm
        orgSlug={org}
        action={boundAction}
        unitOptions={units.map((u) => ({ value: u.id, label: `${u.name} (${u.shortName})` }))}
        groupOptions={flattenGroupTree(groups).map(({ group, path }) => ({
          value: group.id,
          label: path,
        }))}
        defaultValues={{
          name: item.name,
          type: item.type,
          sku: item.sku,
          barcode: item.barcode,
          unitPrice: item.unitPrice.toString(),
          currency: item.currency,
          unitId: item.unitId,
          groupId: item.groupId,
          taxRate: item.taxRate,
          minStock: item.minStock?.toString() ?? null,
        }}
        submitLabel="Сохранить"
        customFieldDefs={customFieldDefs}
        customFieldValues={customFieldValues}
      />
      {item.type === "BUNDLE" && (
        <BundleComponentsEditor
          orgSlug={org}
          bundleId={item.id}
          componentOptions={bundleComponentOptions}
          defaultComponents={bundleDefaultComponents}
        />
      )}
      {item.type === "PRODUCT" && (
        <VariantsEditor
          orgSlug={org}
          catalogItemId={item.id}
          characteristics={characteristics}
          variants={variantRows}
        />
      )}
      {item.type !== "BUNDLE" && (
        <PackagingsEditor
          orgSlug={org}
          catalogItemId={item.id}
          packagingTypeOptions={packagingTypes.map((pt) => ({ value: pt.id, label: pt.name }))}
          unitOptions={units.map((u) => ({ value: u.id, label: `${u.name} (${u.shortName})` }))}
          packagings={packagings.map((p) => ({
            id: p.id,
            packagingTypeName: p.packagingType.name,
            quantity: p.quantity.toString(),
            unitShortName: p.unit?.shortName ?? null,
            barcode: p.barcode,
          }))}
        />
      )}
      {priceTypes.length > 0 && (
        <CatalogItemPricesEditor
          orgSlug={org}
          catalogItemId={item.id}
          priceTypes={priceTypes.map((pt) => ({ id: pt.id, name: pt.name }))}
          initialValues={Object.fromEntries(priceTypes.map((pt) => [pt.id, priceByTypeId.get(pt.id) ?? ""]))}
        />
      )}
      <AttachmentList
        orgSlug={org}
        entityType="CatalogItem"
        entityId={item.id}
        revalidateHref={`/${org}/catalog/${item.id}`}
        attachments={images}
        imageGallery
        title="Изображения"
      />
    </div>
  );
}

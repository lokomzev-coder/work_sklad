import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getOrgContext } from "@/lib/tenant";
import { flattenGroupTree } from "@/lib/catalog-groups";
import { updateCatalogItem } from "@/actions/catalog";
import { CatalogItemForm } from "@/components/catalog/catalog-item-form";
import { BundleComponentsEditor } from "@/components/catalog/bundle-components-editor";
import { VariantsEditor } from "@/components/catalog/variants-editor";
import { variantLabel } from "@/lib/catalog-variants";
import { listCustomFieldDefinitions, getCustomFieldValues } from "@/lib/custom-fields";

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

  const [units, groups, customFieldDefs, customFieldValues] = await Promise.all([
    prisma.unit.findMany({ where: { orgId: ctx.orgId }, orderBy: { name: "asc" } }),
    prisma.catalogGroup.findMany({ where: { orgId: ctx.orgId }, orderBy: { name: "asc" } }),
    listCustomFieldDefinitions(ctx.orgId, "CATALOG_ITEM"),
    getCustomFieldValues(item.id),
  ]);

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
  }[] = [];
  if (item.type === "PRODUCT") {
    const [orgCharacteristics, existingVariants] = await Promise.all([
      prisma.characteristic.findMany({ where: { orgId: ctx.orgId }, orderBy: { name: "asc" } }),
      prisma.catalogItemVariant.findMany({
        where: { catalogItemId: item.id, status: "ACTIVE" },
        include: { values: { include: { characteristic: true } } },
        orderBy: { createdAt: "asc" },
      }),
    ]);
    characteristics = orgCharacteristics.map((c) => ({ id: c.id, name: c.name }));
    variantRows = existingVariants.map((v) => ({
      id: v.id,
      label: variantLabel(v.values),
      sku: v.sku,
      barcode: v.barcode,
      priceOverride: v.priceOverride?.toString() ?? null,
    }));
  }

  return (
    <div className="flex max-w-lg flex-col gap-4">
      <h1 className="text-2xl font-semibold">{item.name}</h1>
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
    </div>
  );
}

import { prisma } from "@/lib/prisma";
import { getOrgContext } from "@/lib/tenant";
import { flattenGroupTree } from "@/lib/catalog-groups";
import { createCatalogItem } from "@/actions/catalog";
import { CatalogItemForm } from "@/components/catalog/catalog-item-form";

export default async function NewCatalogItemPage({
  params,
}: {
  params: Promise<{ org: string }>;
}) {
  const { org } = await params;
  const ctx = await getOrgContext(org);
  const boundAction = createCatalogItem.bind(null, org);

  const [units, groups] = await Promise.all([
    prisma.unit.findMany({ where: { orgId: ctx.orgId }, orderBy: { name: "asc" } }),
    prisma.catalogGroup.findMany({ where: { orgId: ctx.orgId }, orderBy: { name: "asc" } }),
  ]);

  return (
    <div className="flex max-w-lg flex-col gap-4">
      <h1 className="text-2xl font-semibold">Новая позиция</h1>
      <CatalogItemForm
        orgSlug={org}
        action={boundAction}
        unitOptions={units.map((u) => ({ value: u.id, label: `${u.name} (${u.shortName})` }))}
        groupOptions={flattenGroupTree(groups).map(({ group, path }) => ({
          value: group.id,
          label: path,
        }))}
        submitLabel="Создать"
      />
    </div>
  );
}

import { prisma } from "@/lib/prisma";
import { getOrgContext } from "@/lib/tenant";
import { flattenGroupTree } from "@/lib/catalog-groups";
import { createCatalogGroup } from "@/actions/catalog-groups";
import { CatalogGroupForm } from "@/components/catalog/catalog-group-form";

export default async function NewCatalogGroupPage({
  params,
}: {
  params: Promise<{ org: string }>;
}) {
  const { org } = await params;
  const ctx = await getOrgContext(org);
  const boundAction = createCatalogGroup.bind(null, org);

  const groups = await prisma.catalogGroup.findMany({
    where: { orgId: ctx.orgId },
    orderBy: { name: "asc" },
  });
  const parentOptions = flattenGroupTree(groups).map(({ group, path }) => ({
    id: group.id,
    label: path,
  }));

  return (
    <div className="flex max-w-lg flex-col gap-4">
      <h1 className="text-2xl font-semibold">Новая группа</h1>
      <CatalogGroupForm
        orgSlug={org}
        action={boundAction}
        parentOptions={parentOptions}
        submitLabel="Создать"
      />
    </div>
  );
}

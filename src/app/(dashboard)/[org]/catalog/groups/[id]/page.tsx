import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getOrgContext } from "@/lib/tenant";
import { flattenGroupTree } from "@/lib/catalog-groups";
import { updateCatalogGroup } from "@/actions/catalog-groups";
import { CatalogGroupForm } from "@/components/catalog/catalog-group-form";

export default async function EditCatalogGroupPage({
  params,
}: {
  params: Promise<{ org: string; id: string }>;
}) {
  const { org, id } = await params;
  const ctx = await getOrgContext(org);

  const group = await prisma.catalogGroup.findFirst({
    where: { id, orgId: ctx.orgId },
  });
  if (!group) {
    notFound();
  }

  const groups = await prisma.catalogGroup.findMany({
    where: { orgId: ctx.orgId },
    orderBy: { name: "asc" },
  });
  const nodes = flattenGroupTree(groups);

  // A group can't become its own parent or the parent of one of its own
  // descendants — exclude those from the picker (server re-checks too).
  const excluded = new Set<string>([group.id]);
  let changed = true;
  while (changed) {
    changed = false;
    for (const node of nodes) {
      if (
        node.group.parentId &&
        excluded.has(node.group.parentId) &&
        !excluded.has(node.group.id)
      ) {
        excluded.add(node.group.id);
        changed = true;
      }
    }
  }

  const parentOptions = nodes
    .filter(({ group: g }) => !excluded.has(g.id))
    .map(({ group: g, path }) => ({ id: g.id, label: path }));

  const boundAction = updateCatalogGroup.bind(null, org, group.id);

  return (
    <div className="flex max-w-lg flex-col gap-4">
      <h1 className="text-2xl font-semibold">{group.name}</h1>
      <CatalogGroupForm
        orgSlug={org}
        action={boundAction}
        parentOptions={parentOptions}
        defaultValues={{ name: group.name, parentId: group.parentId }}
        submitLabel="Сохранить"
      />
    </div>
  );
}

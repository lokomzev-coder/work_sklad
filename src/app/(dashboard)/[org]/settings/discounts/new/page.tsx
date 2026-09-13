import { prisma } from "@/lib/prisma";
import { getOrgContext } from "@/lib/tenant";
import { flattenGroupTree } from "@/lib/catalog-groups";
import { DiscountForm } from "@/components/settings/discount-form";

export default async function NewDiscountPage({
  params,
}: {
  params: Promise<{ org: string }>;
}) {
  const { org } = await params;
  const ctx = await getOrgContext(org);

  const [groups, catalogItems, clients] = await Promise.all([
    prisma.catalogGroup.findMany({ where: { orgId: ctx.orgId }, orderBy: { name: "asc" } }),
    prisma.catalogItem.findMany({ where: { orgId: ctx.orgId, status: "ACTIVE" }, orderBy: { name: "asc" } }),
    prisma.client.findMany({ where: { orgId: ctx.orgId, status: "ACTIVE", isWalkIn: false }, orderBy: { name: "asc" } }),
  ]);

  return (
    <div className="flex max-w-lg flex-col gap-4">
      <h1 className="text-2xl font-semibold">Новая скидка</h1>
      <DiscountForm
        orgSlug={org}
        catalogGroupOptions={flattenGroupTree(groups).map(({ group, path }) => ({ value: group.id, label: path }))}
        catalogItemOptions={catalogItems.map((c) => ({ value: c.id, label: c.name }))}
        clientOptions={clients.map((c) => ({ value: c.id, label: c.name }))}
      />
    </div>
  );
}

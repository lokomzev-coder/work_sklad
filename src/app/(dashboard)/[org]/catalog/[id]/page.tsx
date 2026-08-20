import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getOrgContext } from "@/lib/tenant";
import { updateCatalogItem } from "@/actions/catalog";
import { CatalogItemForm } from "@/components/catalog/catalog-item-form";

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

  const boundAction = updateCatalogItem.bind(null, org, item.id);

  return (
    <div className="flex max-w-lg flex-col gap-4">
      <h1 className="text-2xl font-semibold">{item.name}</h1>
      <CatalogItemForm
        orgSlug={org}
        action={boundAction}
        defaultValues={{
          name: item.name,
          type: item.type,
          sku: item.sku,
          unitPrice: item.unitPrice.toString(),
          currency: item.currency,
        }}
        submitLabel="Сохранить"
      />
    </div>
  );
}

import { createCatalogItem } from "@/actions/catalog";
import { CatalogItemForm } from "@/components/catalog/catalog-item-form";

export default async function NewCatalogItemPage({
  params,
}: {
  params: Promise<{ org: string }>;
}) {
  const { org } = await params;
  const boundAction = createCatalogItem.bind(null, org);

  return (
    <div className="flex max-w-lg flex-col gap-4">
      <h1 className="text-2xl font-semibold">Новая позиция</h1>
      <CatalogItemForm
        orgSlug={org}
        action={boundAction}
        submitLabel="Создать"
      />
    </div>
  );
}

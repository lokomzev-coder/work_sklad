import { createStore } from "@/actions/stores";
import { StoreForm } from "@/components/warehouse/store-form";

export default async function NewStorePage({
  params,
}: {
  params: Promise<{ org: string }>;
}) {
  const { org } = await params;
  const boundAction = createStore.bind(null, org);

  return (
    <div className="flex max-w-lg flex-col gap-4">
      <h1 className="text-2xl font-semibold">Новый склад</h1>
      <StoreForm orgSlug={org} action={boundAction} submitLabel="Создать" />
    </div>
  );
}

import { createUnit } from "@/actions/units";
import { UnitForm } from "@/components/catalog/unit-form";

export default async function NewUnitPage({
  params,
}: {
  params: Promise<{ org: string }>;
}) {
  const { org } = await params;
  const boundAction = createUnit.bind(null, org);

  return (
    <div className="flex max-w-lg flex-col gap-4">
      <h1 className="text-2xl font-semibold">Новая единица измерения</h1>
      <UnitForm orgSlug={org} action={boundAction} submitLabel="Создать" />
    </div>
  );
}

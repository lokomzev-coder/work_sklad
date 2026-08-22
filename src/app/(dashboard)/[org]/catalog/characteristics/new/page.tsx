import { createCharacteristic } from "@/actions/characteristics";
import { CharacteristicForm } from "@/components/catalog/characteristic-form";

export default async function NewCharacteristicPage({
  params,
}: {
  params: Promise<{ org: string }>;
}) {
  const { org } = await params;
  const boundAction = createCharacteristic.bind(null, org);

  return (
    <div className="flex max-w-lg flex-col gap-4">
      <h1 className="text-2xl font-semibold">Новая характеристика</h1>
      <CharacteristicForm orgSlug={org} action={boundAction} />
    </div>
  );
}

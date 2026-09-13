import { createPriceType } from "@/actions/price-types";
import { PriceTypeForm } from "@/components/settings/price-type-form";

export default async function NewPriceTypePage({
  params,
}: {
  params: Promise<{ org: string }>;
}) {
  const { org } = await params;
  const boundAction = createPriceType.bind(null, org);

  return (
    <div className="flex max-w-lg flex-col gap-4">
      <h1 className="text-2xl font-semibold">Новый тип цены</h1>
      <PriceTypeForm orgSlug={org} action={boundAction} />
    </div>
  );
}

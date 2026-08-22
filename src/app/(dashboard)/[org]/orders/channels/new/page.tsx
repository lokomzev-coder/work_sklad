import { createSalesChannel } from "@/actions/sales-channels";
import { SalesChannelForm } from "@/components/orders/sales-channel-form";

export default async function NewSalesChannelPage({
  params,
}: {
  params: Promise<{ org: string }>;
}) {
  const { org } = await params;
  const boundAction = createSalesChannel.bind(null, org);

  return (
    <div className="flex max-w-lg flex-col gap-4">
      <h1 className="text-2xl font-semibold">Новый канал продаж</h1>
      <SalesChannelForm orgSlug={org} action={boundAction} />
    </div>
  );
}

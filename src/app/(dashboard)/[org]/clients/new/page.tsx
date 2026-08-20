import { createClient } from "@/actions/clients";
import { ClientForm } from "@/components/clients/client-form";

export default async function NewClientPage({
  params,
}: {
  params: Promise<{ org: string }>;
}) {
  const { org } = await params;
  const boundAction = createClient.bind(null, org);

  return (
    <div className="flex max-w-lg flex-col gap-4">
      <h1 className="text-2xl font-semibold">Новый клиент</h1>
      <ClientForm orgSlug={org} action={boundAction} submitLabel="Создать" />
    </div>
  );
}

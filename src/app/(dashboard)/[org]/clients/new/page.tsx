import { getOrgContext } from "@/lib/tenant";
import { createClient } from "@/actions/clients";
import { ClientForm } from "@/components/clients/client-form";
import { listCustomFieldDefinitions } from "@/lib/custom-fields";

export default async function NewClientPage({
  params,
}: {
  params: Promise<{ org: string }>;
}) {
  const { org } = await params;
  const ctx = await getOrgContext(org);
  const boundAction = createClient.bind(null, org);
  const customFieldDefs = await listCustomFieldDefinitions(ctx.orgId, "CLIENT");

  return (
    <div className="flex max-w-lg flex-col gap-4">
      <h1 className="text-2xl font-semibold">Новый клиент</h1>
      <ClientForm
        orgSlug={org}
        action={boundAction}
        submitLabel="Создать"
        customFieldDefs={customFieldDefs}
      />
    </div>
  );
}

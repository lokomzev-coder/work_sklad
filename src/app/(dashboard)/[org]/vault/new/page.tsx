import { notFound } from "next/navigation";
import { getOrgContext } from "@/lib/tenant";
import { can } from "@/lib/permissions";
import { createVaultEntry } from "@/actions/vault";
import { VaultEntryForm } from "@/components/vault/vault-entry-form";

export default async function NewVaultEntryPage({
  params,
}: {
  params: Promise<{ org: string }>;
}) {
  const { org } = await params;
  const ctx = await getOrgContext(org);

  if (!can(ctx, "vault", "create")) {
    notFound();
  }

  const boundAction = createVaultEntry.bind(null, org);

  return (
    <div className="flex max-w-lg flex-col gap-4">
      <h1 className="text-2xl font-semibold">Новая запись сервиса</h1>
      <VaultEntryForm orgSlug={org} action={boundAction} submitLabel="Создать" />
    </div>
  );
}

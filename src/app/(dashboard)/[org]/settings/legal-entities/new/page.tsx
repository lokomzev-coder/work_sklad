import { notFound } from "next/navigation";
import { getOrgContext } from "@/lib/tenant";
import { can } from "@/lib/permissions";
import { createLegalEntity } from "@/actions/legal-entities";
import { LegalEntityForm } from "@/components/settings/legal-entity-form";
import { SettingsSubnav } from "@/components/settings/settings-subnav";

export default async function NewLegalEntityPage({
  params,
}: {
  params: Promise<{ org: string }>;
}) {
  const { org } = await params;
  const ctx = await getOrgContext(org);
  if (!can(ctx, "legalEntities", "create")) notFound();
  const boundAction = createLegalEntity.bind(null, org);

  return (
    <div className="flex max-w-lg flex-col gap-4">
      <SettingsSubnav org={org} active="legal-entities" />
      <h1 className="text-2xl font-semibold">Новое юрлицо</h1>
      <LegalEntityForm orgSlug={org} action={boundAction} submitLabel="Создать" />
    </div>
  );
}

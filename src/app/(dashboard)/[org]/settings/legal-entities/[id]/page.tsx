import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getOrgContext } from "@/lib/tenant";
import { can } from "@/lib/permissions";
import { updateLegalEntity } from "@/actions/legal-entities";
import { LegalEntityForm } from "@/components/settings/legal-entity-form";
import { SettingsSubnav } from "@/components/settings/settings-subnav";

export default async function EditLegalEntityPage({
  params,
}: {
  params: Promise<{ org: string; id: string }>;
}) {
  const { org, id } = await params;
  const ctx = await getOrgContext(org);
  if (!can(ctx.role, "settings", "edit")) notFound();

  const legalEntity = await prisma.legalEntity.findFirst({
    where: { id, orgId: ctx.orgId },
  });
  if (!legalEntity) notFound();

  const boundAction = updateLegalEntity.bind(null, org, id);

  return (
    <div className="flex max-w-lg flex-col gap-4">
      <SettingsSubnav org={org} active="legal-entities" />
      <h1 className="text-2xl font-semibold">{legalEntity.name}</h1>
      <LegalEntityForm
        orgSlug={org}
        action={boundAction}
        submitLabel="Сохранить"
        defaultValues={{
          name: legalEntity.name,
          inn: legalEntity.inn,
          kpp: legalEntity.kpp,
          ogrn: legalEntity.ogrn,
          address: legalEntity.address,
          bankName: legalEntity.bankName,
          bankBik: legalEntity.bankBik,
          bankAccount: legalEntity.bankAccount,
          isDefault: legalEntity.isDefault,
        }}
      />
    </div>
  );
}

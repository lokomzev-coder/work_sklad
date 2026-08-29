import { notFound } from "next/navigation";
import { getOrgContext } from "@/lib/tenant";
import { can } from "@/lib/permissions";
import { listCustomFieldDefinitions } from "@/lib/custom-fields";
import { SettingsSubnav } from "@/components/settings/settings-subnav";
import { CustomFieldDefinitionsManager } from "@/components/settings/custom-field-definitions-manager";

const SECTIONS: { entityType: "CLIENT" | "CATALOG_ITEM" | "ORDER" | "PURCHASE_ORDER"; label: string }[] = [
  { entityType: "CLIENT", label: "Клиенты" },
  { entityType: "CATALOG_ITEM", label: "Товары и услуги" },
  { entityType: "ORDER", label: "Заказы" },
  { entityType: "PURCHASE_ORDER", label: "Заказы поставщику" },
];

export default async function CustomFieldsPage({
  params,
}: {
  params: Promise<{ org: string }>;
}) {
  const { org } = await params;
  const ctx = await getOrgContext(org);
  if (!can(ctx.role, "settings", "read")) notFound();

  const defsBySection = await Promise.all(
    SECTIONS.map((s) => listCustomFieldDefinitions(ctx.orgId, s.entityType)),
  );

  return (
    <div className="flex flex-col gap-6">
      <SettingsSubnav org={org} active="custom-fields" />
      <div>
        <h1 className="text-2xl font-semibold">Дополнительные поля</h1>
        <p className="text-sm text-muted-foreground">
          Добавьте свои поля к клиентам, товарам/услугам, заказам и заказам поставщику — они
          появятся на карточке сразу после создания.
        </p>
      </div>

      {SECTIONS.map((section, i) => (
        <div key={section.entityType} className="flex flex-col gap-3">
          <h2 className="text-lg font-medium">{section.label}</h2>
          <CustomFieldDefinitionsManager
            orgSlug={org}
            entityType={section.entityType}
            defs={defsBySection[i]}
          />
        </div>
      ))}
    </div>
  );
}

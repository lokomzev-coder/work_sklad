import { notFound } from "next/navigation";
import { getOrgContext } from "@/lib/tenant";
import { can } from "@/lib/permissions";
import { listRelatedFieldConfigs } from "@/lib/related-fields";
import { listCustomFieldDefinitions } from "@/lib/custom-fields";
import { SettingsSubnav } from "@/components/settings/settings-subnav";
import { RelatedFieldConfigsManager } from "@/components/settings/related-field-configs-manager";
import type { RelatedFieldDocumentType } from "@/generated/prisma/enums";

const SECTIONS: { documentType: RelatedFieldDocumentType; label: string }[] = [
  { documentType: "ORDER", label: "Заказы" },
  { documentType: "PURCHASE_ORDER", label: "Заказы поставщику" },
  { documentType: "INVOICE_OUT", label: "Счета покупателям" },
  { documentType: "INVOICE_IN", label: "Счета поставщиков" },
];

export default async function RelatedFieldsPage({
  params,
}: {
  params: Promise<{ org: string }>;
}) {
  const { org } = await params;
  const ctx = await getOrgContext(org);
  if (!can(ctx, "customFields", "view")) notFound();

  const [configsBySection, clientCustomFieldDefs] = await Promise.all([
    Promise.all(SECTIONS.map((s) => listRelatedFieldConfigs(ctx.orgId, s.documentType))),
    listCustomFieldDefinitions(ctx.orgId, "CLIENT"),
  ]);

  return (
    <div className="flex flex-col gap-6">
      <SettingsSubnav org={org} active="related-fields" />
      <div>
        <h1 className="text-2xl font-semibold">Поля клиента в документах</h1>
        <p className="text-sm text-muted-foreground">
          Выберите, какие поля клиента (встроенные, например ИНН или телефон, либо уже
          заведённые на вкладке «Доп. поля» → «Клиенты») показывать на карточке заказа/счёта и
          в печатной форме. Несколько контактов или адресов клиента сюда не выводятся — только
          его собственные поля.
        </p>
      </div>

      {SECTIONS.map((section, i) => (
        <div key={section.documentType} className="flex flex-col gap-3">
          <h2 className="text-lg font-medium">{section.label}</h2>
          <RelatedFieldConfigsManager
            orgSlug={org}
            documentType={section.documentType}
            configs={configsBySection[i]}
            clientCustomFieldDefs={clientCustomFieldDefs.map((d) => ({ id: d.id, name: d.name }))}
          />
        </div>
      ))}
    </div>
  );
}

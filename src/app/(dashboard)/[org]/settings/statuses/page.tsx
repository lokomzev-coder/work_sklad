import { notFound } from "next/navigation";
import { getOrgContext } from "@/lib/tenant";
import { can } from "@/lib/permissions";
import { listDocumentStatuses } from "@/lib/document-statuses";
import { SettingsSubnav } from "@/components/settings/settings-subnav";
import { DocumentStatusManager } from "@/components/settings/document-status-manager";

export default async function DocumentStatusesPage({
  params,
}: {
  params: Promise<{ org: string }>;
}) {
  const { org } = await params;
  const ctx = await getOrgContext(org);
  if (!can(ctx.role, "settings", "read")) notFound();

  const [orderStatuses, purchaseOrderStatuses] = await Promise.all([
    listDocumentStatuses(ctx.orgId, "ORDER"),
    listDocumentStatuses(ctx.orgId, "PURCHASE_ORDER"),
  ]);

  return (
    <div className="flex flex-col gap-6">
      <SettingsSubnav org={org} active="statuses" />
      <div>
        <h1 className="text-2xl font-semibold">Статусы документов</h1>
        <p className="text-sm text-muted-foreground">
          Настройте набор статусов и их порядок для заказов и заказов поставщику. Отметьте статус как
          «финальный», если он завершает жизненный цикл документа.
        </p>
      </div>

      <div className="flex flex-col gap-3">
        <h2 className="text-lg font-medium">Заказы</h2>
        <DocumentStatusManager orgSlug={org} kind="ORDER" statuses={orderStatuses} />
      </div>

      <div className="flex flex-col gap-3">
        <h2 className="text-lg font-medium">Заказы поставщику</h2>
        <DocumentStatusManager orgSlug={org} kind="PURCHASE_ORDER" statuses={purchaseOrderStatuses} />
      </div>
    </div>
  );
}

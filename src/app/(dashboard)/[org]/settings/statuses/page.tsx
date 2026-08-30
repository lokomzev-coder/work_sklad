import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getOrgContext } from "@/lib/tenant";
import { can } from "@/lib/permissions";
import { listDocumentStatuses, listTransitions } from "@/lib/document-statuses";
import { SettingsSubnav } from "@/components/settings/settings-subnav";
import { DocumentStatusManager } from "@/components/settings/document-status-manager";
import { DocumentStatusTransitionsManager } from "@/components/settings/document-status-transitions-manager";

export default async function DocumentStatusesPage({
  params,
}: {
  params: Promise<{ org: string }>;
}) {
  const { org } = await params;
  const ctx = await getOrgContext(org);
  if (!can(ctx.role, "settings", "read")) notFound();

  const [
    orderStatuses,
    purchaseOrderStatuses,
    orderTransitions,
    purchaseOrderTransitions,
    customRoles,
    employees,
  ] = await Promise.all([
    listDocumentStatuses(ctx.orgId, "ORDER"),
    listDocumentStatuses(ctx.orgId, "PURCHASE_ORDER"),
    listTransitions(ctx.orgId, "ORDER"),
    listTransitions(ctx.orgId, "PURCHASE_ORDER"),
    prisma.customRole.findMany({ where: { orgId: ctx.orgId }, orderBy: { name: "asc" } }),
    prisma.employee.findMany({ where: { orgId: ctx.orgId, status: "ACTIVE" }, orderBy: { fullName: "asc" } }),
  ]);
  const customRoleOptions = customRoles.map((r) => ({ id: r.id, name: r.name }));
  const employeeOptions = employees.map((e) => ({ id: e.id, name: e.fullName }));

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

      <div>
        <h1 className="text-2xl font-semibold">Переходы между статусами</h1>
        <p className="text-sm text-muted-foreground">
          Опционально ограничьте, из какого статуса в какой можно переходить, и кому именно.
        </p>
      </div>

      <div className="flex flex-col gap-3">
        <h2 className="text-lg font-medium">Заказы</h2>
        <DocumentStatusTransitionsManager
          orgSlug={org}
          kind="ORDER"
          statuses={orderStatuses}
          transitions={orderTransitions}
          customRoles={customRoleOptions}
          employees={employeeOptions}
        />
      </div>

      <div className="flex flex-col gap-3">
        <h2 className="text-lg font-medium">Заказы поставщику</h2>
        <DocumentStatusTransitionsManager
          orgSlug={org}
          kind="PURCHASE_ORDER"
          statuses={purchaseOrderStatuses}
          transitions={purchaseOrderTransitions}
          customRoles={customRoleOptions}
          employees={employeeOptions}
        />
      </div>
    </div>
  );
}

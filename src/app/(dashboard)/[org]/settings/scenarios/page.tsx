import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getOrgContext } from "@/lib/tenant";
import { can } from "@/lib/permissions";
import { SettingsSubnav } from "@/components/settings/settings-subnav";
import { ScenariosManager } from "@/components/settings/scenarios-manager";
import type { ScenarioDocumentType } from "@/generated/prisma/enums";

const DOCUMENT_TYPES: ScenarioDocumentType[] = ["ORDER", "PURCHASE_ORDER", "INVOICE_OUT", "INVOICE_IN", "PRODUCTION_ORDER"];

export default async function ScenariosPage({
  params,
}: {
  params: Promise<{ org: string }>;
}) {
  const { org } = await params;
  const ctx = await getOrgContext(org);
  if (!can(ctx, "scenarios", "view")) notFound();

  const [rules, statuses, clients, employees, customRoles, webhooks] = await Promise.all([
    prisma.scenarioRule.findMany({
      where: { orgId: ctx.orgId },
      orderBy: { createdAt: "desc" },
      include: { conditions: { orderBy: { sortOrder: "asc" } }, actions: { orderBy: { sortOrder: "asc" } } },
    }),
    prisma.documentStatus.findMany({
      where: { orgId: ctx.orgId, kind: { in: DOCUMENT_TYPES } },
      select: { id: true, name: true, kind: true },
    }),
    prisma.client.findMany({ where: { orgId: ctx.orgId }, select: { id: true, name: true } }),
    prisma.employee.findMany({ where: { orgId: ctx.orgId }, select: { id: true, fullName: true } }),
    prisma.customRole.findMany({ where: { orgId: ctx.orgId }, select: { id: true, name: true } }),
    prisma.webhook.findMany({ where: { orgId: ctx.orgId, isActive: true }, select: { id: true, url: true } }),
  ]);

  const statusesByType: Record<string, { id: string; name: string }[]> = {};
  for (const type of DOCUMENT_TYPES) {
    statusesByType[type] = statuses.filter((s) => s.kind === type).map((s) => ({ id: s.id, name: s.name }));
  }

  return (
    <div className="flex flex-col gap-6">
      <SettingsSubnav org={org} active="scenarios" />
      <div>
        <h1 className="text-2xl font-semibold">Сценарии</h1>
        <p className="text-sm text-muted-foreground">
          Автоматические действия при создании документа или изменении его статуса: создать связанный документ,
          отправить внутреннее уведомление, вызвать вебхук.
        </p>
      </div>
      <ScenariosManager
        orgSlug={org}
        canEdit={can(ctx, "scenarios", "create")}
        rules={rules.map((r) => ({
          id: r.id,
          name: r.name,
          documentType: r.documentType,
          eventType: r.eventType,
          isActive: r.isActive,
          conditions: r.conditions.map((c) => ({ field: c.field, operator: c.operator, value: c.value })),
          actions: r.actions.map((a) => ({ type: a.type, config: a.config as Record<string, unknown> })),
        }))}
        statusesByType={statusesByType}
        clients={clients.map((c) => ({ id: c.id, name: c.name }))}
        employees={employees.map((e) => ({ id: e.id, name: e.fullName }))}
        customRoles={customRoles.map((r) => ({ id: r.id, name: r.name }))}
        webhooks={webhooks.map((w) => ({ id: w.id, url: w.url }))}
      />
    </div>
  );
}

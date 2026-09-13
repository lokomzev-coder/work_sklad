import { notFound } from "next/navigation";
import { prisma, withDbRetry } from "@/lib/prisma";
import { getOrgContext } from "@/lib/tenant";
import { can } from "@/lib/permissions";
import { SettingsSubnav } from "@/components/settings/settings-subnav";
import { QuerySelectFilter } from "@/components/forms/query-select-filter";
import { AuditDiffView } from "@/components/settings/audit-diff-view";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "@/components/ui/table";
import {
  AUDIT_ENTITY_LABELS,
  AUDIT_ACTION_LABELS,
  AUDIT_SOURCE_LABELS,
} from "@/lib/audit-entity-labels";

const PAGE_SIZE = 100;

export default async function AuditLogPage({
  params,
  searchParams,
}: {
  params: Promise<{ org: string }>;
  searchParams: Promise<{ entityType?: string }>;
}) {
  const { org } = await params;
  const { entityType } = await searchParams;
  const ctx = await getOrgContext(org);
  if (!can(ctx, "auditLog", "view")) notFound();

  const entries = await withDbRetry(() =>
    prisma.auditLog.findMany({
      where: { orgId: ctx.orgId, ...(entityType ? { entityType } : {}) },
      orderBy: { createdAt: "desc" },
      take: PAGE_SIZE,
    }),
  );

  return (
    <div className="flex flex-col gap-6">
      <SettingsSubnav org={org} active="audit-log" />
      <div>
        <h1 className="text-2xl font-semibold">Журнал изменений</h1>
        <p className="text-sm text-muted-foreground">
          Кто, когда и что изменил — заказы, товары, клиентов, платежи и другие ключевые
          сущности. Последние {PAGE_SIZE} записей. Изменения через фоновые задачи (например,
          автоматические сценарии) в этот журнал не попадают — только действия из интерфейса и
          через API.
        </p>
      </div>

      <div className="w-64">
        <QuerySelectFilter
          basePath={`/${org}/settings/audit-log`}
          paramName="entityType"
          value={entityType ?? ""}
          allLabel="Все сущности"
          options={Object.entries(AUDIT_ENTITY_LABELS).map(([value, label]) => ({ value, label }))}
        />
      </div>

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Дата</TableHead>
              <TableHead>Сущность</TableHead>
              <TableHead>Действие</TableHead>
              <TableHead>Кто</TableHead>
              <TableHead>Источник</TableHead>
              <TableHead>Изменения</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {entries.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center text-muted-foreground">
                  Записей пока нет
                </TableCell>
              </TableRow>
            ) : (
              entries.map((entry) => (
                <TableRow key={entry.id}>
                  <TableCell className="whitespace-nowrap text-muted-foreground">
                    {entry.createdAt.toLocaleString("ru-RU")}
                  </TableCell>
                  <TableCell>{AUDIT_ENTITY_LABELS[entry.entityType] ?? entry.entityType}</TableCell>
                  <TableCell>
                    <Badge
                      variant={
                        entry.action === "DELETE" ? "destructive" : entry.action === "CREATE" ? "default" : "secondary"
                      }
                    >
                      {AUDIT_ACTION_LABELS[entry.action] ?? entry.action}
                    </Badge>
                  </TableCell>
                  <TableCell>{entry.actorLabel}</TableCell>
                  <TableCell className="text-muted-foreground">
                    {AUDIT_SOURCE_LABELS[entry.source] ?? entry.source}
                  </TableCell>
                  <TableCell>
                    <AuditDiffView diff={entry.diff as never} action={entry.action} />
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getOrgContext } from "@/lib/tenant";
import { can } from "@/lib/permissions";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { SettingsSubnav } from "@/components/settings/settings-subnav";
import {
  ArchivableEntityTable,
  StatusTabs,
  type EntityStatusFilter,
} from "@/components/data-table/archivable-entity-table";
import { ArchiveRowActions } from "@/components/data-table/archive-row-actions";
import { archiveLegalEntity, restoreLegalEntity, deleteLegalEntity } from "@/actions/legal-entities";

export default async function LegalEntitiesPage({
  params,
  searchParams,
}: {
  params: Promise<{ org: string }>;
  searchParams: Promise<{ status?: string }>;
}) {
  const { org } = await params;
  const { status } = await searchParams;
  const ctx = await getOrgContext(org);
  if (!can(ctx.role, "settings", "read")) notFound();
  const canEdit = can(ctx.role, "settings", "edit");

  const statusFilter: EntityStatusFilter = status === "ARCHIVED" ? "ARCHIVED" : "ACTIVE";

  const legalEntities = await prisma.legalEntity.findMany({
    where: { orgId: ctx.orgId, status: statusFilter },
    orderBy: { name: "asc" },
  });

  return (
    <div className="flex flex-col gap-4">
      <SettingsSubnav org={org} active="legal-entities" />
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Юрлица</h1>
        {canEdit && (
          <Button render={<Link href={`/${org}/settings/legal-entities/new`} />}>
            Добавить юрлицо
          </Button>
        )}
      </div>
      <StatusTabs basePath={`/${org}/settings/legal-entities`} active={statusFilter} />
      <ArchivableEntityTable
        data={legalEntities}
        rowHref={canEdit ? (row) => `/${org}/settings/legal-entities/${row.id}` : undefined}
        emptyMessage="Юрлица ещё не добавлены"
        columns={[
          {
            header: "Название",
            cell: (row) => (
              <span className="flex items-center gap-2 font-medium">
                {row.name}
                {row.isDefault && <Badge variant="secondary">По умолчанию</Badge>}
              </span>
            ),
          },
          { header: "ИНН", cell: (row) => row.inn ?? "—" },
        ]}
        rowActions={
          canEdit
            ? (row) => (
                <ArchiveRowActions
                  status={statusFilter}
                  onArchive={archiveLegalEntity.bind(null, org, row.id)}
                  onRestore={restoreLegalEntity.bind(null, org, row.id)}
                  onDelete={deleteLegalEntity.bind(null, org, row.id)}
                  deleteTitle="Удалить юрлицо?"
                />
              )
            : undefined
        }
      />
    </div>
  );
}

import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getOrgContext } from "@/lib/tenant";
import { can } from "@/lib/permissions";
import { Button } from "@/components/ui/button";
import {
  ArchivableEntityTable,
  StatusTabs,
  type EntityStatusFilter,
} from "@/components/data-table/archivable-entity-table";
import { ArchiveRowActions } from "@/components/data-table/archive-row-actions";
import { archiveProject, restoreProject, deleteProject } from "@/actions/projects";
import { formatMoney } from "@/lib/format";

export default async function ProjectsPage({
  params,
  searchParams,
}: {
  params: Promise<{ org: string }>;
  searchParams: Promise<{ status?: string }>;
}) {
  const { org } = await params;
  const { status } = await searchParams;
  const ctx = await getOrgContext(org);
  if (!can(ctx, "projects", "view")) notFound();

  const activeTab: EntityStatusFilter = status === "ARCHIVED" ? "ARCHIVED" : "ACTIVE";

  const projects = await prisma.project.findMany({
    where: { orgId: ctx.orgId, status: activeTab },
    orderBy: { createdAt: "desc" },
    include: { client: true, responsibleEmployee: true },
  });

  const canEdit = can(ctx, "projects", "edit");
  const canCreate = can(ctx, "projects", "create");

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Проекты</h1>
        {canCreate && <Button render={<Link href={`/${org}/projects/new`} />}>Новый проект</Button>}
      </div>

      <StatusTabs basePath={`/${org}/projects`} active={activeTab} />

      <ArchivableEntityTable
        data={projects}
        emptyMessage={activeTab === "ACTIVE" ? "Пока нет проектов" : "В архиве пусто"}
        rowHref={canEdit ? (row) => `/${org}/projects/${row.id}` : undefined}
        columns={[
          { header: "Название", cell: (row) => row.name },
          { header: "Клиент", cell: (row) => row.client?.name ?? "—" },
          { header: "Ответственный", cell: (row) => row.responsibleEmployee?.fullName ?? "—" },
          {
            header: "Сроки",
            cell: (row) =>
              row.startDate || row.endDate
                ? `${row.startDate ? row.startDate.toLocaleDateString("ru-RU") : "—"} – ${row.endDate ? row.endDate.toLocaleDateString("ru-RU") : "—"}`
                : "—",
          },
          { header: "Бюджет", cell: (row) => (row.budget ? formatMoney(Number(row.budget), row.currency) : "—") },
        ]}
        rowActions={
          canEdit
            ? (row) => (
                <ArchiveRowActions
                  status={row.status}
                  onArchive={archiveProject.bind(null, org, row.id)}
                  onRestore={restoreProject.bind(null, org, row.id)}
                  onDelete={deleteProject.bind(null, org, row.id)}
                  deleteTitle="Удалить проект?"
                />
              )
            : undefined
        }
      />
    </div>
  );
}

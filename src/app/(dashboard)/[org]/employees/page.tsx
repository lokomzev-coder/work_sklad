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
import {
  archiveEmployee,
  restoreEmployee,
  deleteEmployee,
} from "@/actions/employees";

export default async function EmployeesPage({
  params,
  searchParams,
}: {
  params: Promise<{ org: string }>;
  searchParams: Promise<{ status?: string }>;
}) {
  const { org } = await params;
  const { status } = await searchParams;
  const ctx = await getOrgContext(org);
  if (!can(ctx, "employees", "view")) notFound();

  const activeTab: EntityStatusFilter =
    status === "ARCHIVED" ? "ARCHIVED" : "ACTIVE";

  const employees = await prisma.employee.findMany({
    where: { orgId: ctx.orgId, status: activeTab },
    orderBy: { createdAt: "desc" },
  });

  const canEdit = can(ctx, "employees", "edit");
  const canCreate = can(ctx, "employees", "create");

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Сотрудники</h1>
        {canCreate && (
          <Button render={<Link href={`/${org}/employees/new`} />}>
            Добавить сотрудника
          </Button>
        )}
      </div>

      <StatusTabs basePath={`/${org}/employees`} active={activeTab} />

      <ArchivableEntityTable
        data={employees}
        emptyMessage={
          activeTab === "ACTIVE"
            ? "Пока нет сотрудников"
            : "В архиве пусто"
        }
        rowHref={canEdit ? (row) => `/${org}/employees/${row.id}` : undefined}
        columns={[
          { header: "Имя", cell: (row) => row.fullName },
          { header: "Должность", cell: (row) => row.position ?? "—" },
          { header: "Email", cell: (row) => row.email ?? "—" },
          { header: "Телефон", cell: (row) => row.phone ?? "—" },
        ]}
        rowActions={
          canEdit
            ? (row) => (
                <ArchiveRowActions
                  status={row.status}
                  onArchive={archiveEmployee.bind(null, org, row.id)}
                  onRestore={restoreEmployee.bind(null, org, row.id)}
                  onDelete={deleteEmployee.bind(null, org, row.id)}
                  deleteTitle="Удалить сотрудника?"
                />
              )
            : undefined
        }
      />
    </div>
  );
}

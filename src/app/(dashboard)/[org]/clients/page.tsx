import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getOrgContext } from "@/lib/tenant";
import { can } from "@/lib/permissions";
import { buildScopeWhere } from "@/lib/scope";
import { Button } from "@/components/ui/button";
import {
  ArchivableEntityTable,
  StatusTabs,
  type EntityStatusFilter,
} from "@/components/data-table/archivable-entity-table";
import { ArchiveRowActions } from "@/components/data-table/archive-row-actions";
import { archiveClient, restoreClient, deleteClient } from "@/actions/clients";

export default async function ClientsPage({
  params,
  searchParams,
}: {
  params: Promise<{ org: string }>;
  searchParams: Promise<{ status?: string }>;
}) {
  const { org } = await params;
  const { status } = await searchParams;
  const ctx = await getOrgContext(org);
  if (!can(ctx, "clients", "view")) notFound();

  const activeTab: EntityStatusFilter =
    status === "ARCHIVED" ? "ARCHIVED" : "ACTIVE";

  const scopeWhere = await buildScopeWhere(ctx, "clients");
  const clients = await prisma.client.findMany({
    where: { orgId: ctx.orgId, status: activeTab, ...scopeWhere },
    orderBy: { createdAt: "desc" },
  });

  const canEdit = can(ctx, "clients", "edit");
  const canCreate = can(ctx, "clients", "create");

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Клиенты</h1>
        {canCreate && (
          <Button render={<Link href={`/${org}/clients/new`} />}>
            Добавить клиента
          </Button>
        )}
      </div>

      <StatusTabs basePath={`/${org}/clients`} active={activeTab} />

      <ArchivableEntityTable
        data={clients}
        emptyMessage={
          activeTab === "ACTIVE" ? "Пока нет клиентов" : "В архиве пусто"
        }
        rowHref={canEdit ? (row) => `/${org}/clients/${row.id}` : undefined}
        columns={[
          { header: "Название", cell: (row) => row.name },
          { header: "ИНН", cell: (row) => row.inn ?? "—" },
          { header: "Email", cell: (row) => row.email ?? "—" },
          { header: "Телефон", cell: (row) => row.phone ?? "—" },
        ]}
        rowActions={
          canEdit
            ? (row) => (
                <ArchiveRowActions
                  status={row.status}
                  onArchive={archiveClient.bind(null, org, row.id)}
                  onRestore={restoreClient.bind(null, org, row.id)}
                  onDelete={deleteClient.bind(null, org, row.id)}
                  deleteTitle="Удалить клиента?"
                />
              )
            : undefined
        }
      />
    </div>
  );
}

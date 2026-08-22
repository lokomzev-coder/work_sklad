import Link from "next/link";
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
import { WarehouseSubnav } from "@/components/warehouse/warehouse-subnav";
import { archiveStore, restoreStore, deleteStore } from "@/actions/stores";

export default async function StoresPage({
  params,
  searchParams,
}: {
  params: Promise<{ org: string }>;
  searchParams: Promise<{ status?: string }>;
}) {
  const { org } = await params;
  const { status } = await searchParams;
  const ctx = await getOrgContext(org);
  const canEdit = can(ctx.role, "warehouse", "edit");

  const activeTab: EntityStatusFilter =
    status === "ARCHIVED" ? "ARCHIVED" : "ACTIVE";

  const stores = await prisma.store.findMany({
    where: { orgId: ctx.orgId, status: activeTab },
    orderBy: { createdAt: "desc" },
  });

  return (
    <div className="flex flex-col gap-4">
      <WarehouseSubnav org={org} active="stores" />
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Склады</h1>
        {canEdit && (
          <Button render={<Link href={`/${org}/warehouse/stores/new`} />}>
            Добавить
          </Button>
        )}
      </div>

      <StatusTabs basePath={`/${org}/warehouse/stores`} active={activeTab} />

      <ArchivableEntityTable
        data={stores}
        emptyMessage={activeTab === "ACTIVE" ? "Складов пока нет" : "В архиве пусто"}
        rowHref={canEdit ? (row) => `/${org}/warehouse/stores/${row.id}` : undefined}
        columns={[
          { header: "Название", cell: (row) => row.name },
          { header: "Адрес", cell: (row) => row.address ?? "—" },
        ]}
        rowActions={
          canEdit
            ? (row) => (
                <ArchiveRowActions
                  status={row.status}
                  onArchive={archiveStore.bind(null, org, row.id)}
                  onRestore={restoreStore.bind(null, org, row.id)}
                  onDelete={deleteStore.bind(null, org, row.id)}
                  deleteTitle="Удалить склад?"
                />
              )
            : undefined
        }
      />
    </div>
  );
}

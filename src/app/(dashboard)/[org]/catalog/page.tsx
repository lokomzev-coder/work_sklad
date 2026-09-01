import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getOrgContext } from "@/lib/tenant";
import { can } from "@/lib/permissions";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  ArchivableEntityTable,
  StatusTabs,
  type EntityStatusFilter,
} from "@/components/data-table/archivable-entity-table";
import { ArchiveRowActions } from "@/components/data-table/archive-row-actions";
import { CatalogSubnav } from "@/components/catalog/catalog-subnav";
import { QuerySelectFilter } from "@/components/forms/query-select-filter";
import { flattenGroupTree } from "@/lib/catalog-groups";
import {
  archiveCatalogItem,
  restoreCatalogItem,
  deleteCatalogItem,
} from "@/actions/catalog";
import { formatMoney } from "@/lib/format";

const TYPE_LABEL: Record<string, string> = {
  PRODUCT: "Товар",
  SERVICE: "Услуга",
  BUNDLE: "Комплект",
};

export default async function CatalogPage({
  params,
  searchParams,
}: {
  params: Promise<{ org: string }>;
  searchParams: Promise<{ status?: string; group?: string }>;
}) {
  const { org } = await params;
  const { status, group: groupFilter } = await searchParams;
  const ctx = await getOrgContext(org);
  if (!can(ctx, "catalog", "view")) notFound();

  const activeTab: EntityStatusFilter =
    status === "ARCHIVED" ? "ARCHIVED" : "ACTIVE";

  const [items, groups] = await Promise.all([
    prisma.catalogItem.findMany({
      where: {
        orgId: ctx.orgId,
        status: activeTab,
        ...(groupFilter ? { groupId: groupFilter } : {}),
      },
      orderBy: { createdAt: "desc" },
      include: { group: true },
    }),
    prisma.catalogGroup.findMany({ where: { orgId: ctx.orgId }, orderBy: { name: "asc" } }),
  ]);

  const canEdit = can(ctx, "catalog", "edit");

  return (
    <div className="flex flex-col gap-4">
      <CatalogSubnav org={org} active="catalog" />
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Товары и услуги</h1>
        {canEdit && (
          <Button render={<Link href={`/${org}/catalog/new`} />}>
            Добавить
          </Button>
        )}
      </div>

      <div className="flex items-center justify-between gap-4">
        <StatusTabs basePath={`/${org}/catalog`} active={activeTab} />
        {groups.length > 0 && (
          <QuerySelectFilter
            basePath={`/${org}/catalog`}
            paramName="group"
            value={groupFilter ?? ""}
            allLabel="Все группы"
            options={flattenGroupTree(groups).map(({ group, path }) => ({
              value: group.id,
              label: path,
            }))}
          />
        )}
      </div>

      <ArchivableEntityTable
        data={items}
        emptyMessage={
          activeTab === "ACTIVE" ? "Каталог пуст" : "В архиве пусто"
        }
        rowHref={canEdit ? (row) => `/${org}/catalog/${row.id}` : undefined}
        columns={[
          { header: "Название", cell: (row) => row.name },
          {
            header: "Тип",
            cell: (row) => (
              <Badge variant="secondary">{TYPE_LABEL[row.type]}</Badge>
            ),
          },
          { header: "Артикул", cell: (row) => row.sku ?? "—" },
          { header: "Группа", cell: (row) => row.group?.name ?? "—" },
          {
            header: "Цена",
            cell: (row) => formatMoney(Number(row.unitPrice), row.currency),
          },
        ]}
        rowActions={
          canEdit
            ? (row) => (
                <ArchiveRowActions
                  status={row.status}
                  onArchive={archiveCatalogItem.bind(null, org, row.id)}
                  onRestore={restoreCatalogItem.bind(null, org, row.id)}
                  onDelete={deleteCatalogItem.bind(null, org, row.id)}
                  deleteTitle="Удалить позицию каталога?"
                />
              )
            : undefined
        }
      />
    </div>
  );
}

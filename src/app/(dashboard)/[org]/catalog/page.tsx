import Link from "next/link";
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
import {
  archiveCatalogItem,
  restoreCatalogItem,
  deleteCatalogItem,
} from "@/actions/catalog";

const TYPE_LABEL: Record<string, string> = {
  PRODUCT: "Товар",
  SERVICE: "Услуга",
};

export default async function CatalogPage({
  params,
  searchParams,
}: {
  params: Promise<{ org: string }>;
  searchParams: Promise<{ status?: string }>;
}) {
  const { org } = await params;
  const { status } = await searchParams;
  const ctx = await getOrgContext(org);

  const activeTab: EntityStatusFilter =
    status === "ARCHIVED" ? "ARCHIVED" : "ACTIVE";

  const items = await prisma.catalogItem.findMany({
    where: { orgId: ctx.orgId, status: activeTab },
    orderBy: { createdAt: "desc" },
  });

  const canEdit = can(ctx.role, "catalog", "edit");

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Товары и услуги</h1>
        {canEdit && (
          <Button render={<Link href={`/${org}/catalog/new`} />}>
            Добавить
          </Button>
        )}
      </div>

      <StatusTabs basePath={`/${org}/catalog`} active={activeTab} />

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
          {
            header: "Цена",
            cell: (row) => `${row.unitPrice.toString()} ${row.currency}`,
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

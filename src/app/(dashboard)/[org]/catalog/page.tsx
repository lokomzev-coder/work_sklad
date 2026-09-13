import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getOrgContext } from "@/lib/tenant";
import { can } from "@/lib/permissions";
import { Button } from "@/components/ui/button";
import {
  StatusTabs,
  type EntityStatusFilter,
} from "@/components/data-table/archivable-entity-table";
import { CatalogSubnav } from "@/components/catalog/catalog-subnav";
import { ImportWizard } from "@/components/catalog/import-wizard";
import { CatalogPrintSection } from "@/components/catalog/catalog-print-section";
import { QuerySelectFilter } from "@/components/forms/query-select-filter";
import { flattenGroupTree } from "@/lib/catalog-groups";
import {
  archiveCatalogItem,
  restoreCatalogItem,
  deleteCatalogItem,
} from "@/actions/catalog";

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

  const [items, groups, labelTemplates] = await Promise.all([
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
    prisma.labelTemplate.findMany({ where: { orgId: ctx.orgId }, orderBy: { name: "asc" } }),
  ]);

  const canEdit = can(ctx, "catalog", "edit");
  const canImport = can(ctx, "catalogImport", "create");

  return (
    <div className="flex flex-col gap-4">
      <CatalogSubnav org={org} active="catalog" />
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Товары и услуги</h1>
        <div className="flex items-center gap-2">
          {canImport && <ImportWizard orgSlug={org} />}
          {canEdit && (
            <Button render={<Link href={`/${org}/catalog/new`} />}>
              Добавить
            </Button>
          )}
        </div>
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

      <CatalogPrintSection
        orgSlug={org}
        activeTab={activeTab}
        canEdit={canEdit}
        templates={labelTemplates.map((t) => ({ id: t.id, name: t.name }))}
        openPdfInBrowser={ctx.openPdfInBrowser}
        rows={items.map((item) => ({
          id: item.id,
          name: item.name,
          type: item.type,
          sku: item.sku,
          groupName: item.group?.name ?? null,
          unitPrice: Number(item.unitPrice),
          currency: item.currency,
          status: item.status as EntityStatusFilter,
        }))}
        onArchive={archiveCatalogItem.bind(null, org)}
        onRestore={restoreCatalogItem.bind(null, org)}
        onDelete={deleteCatalogItem.bind(null, org)}
      />
    </div>
  );
}

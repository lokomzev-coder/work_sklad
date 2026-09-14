import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getOrgContext } from "@/lib/tenant";
import { can } from "@/lib/permissions";
import { buildVaultScopeWhere } from "@/lib/vault-scope";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  ArchivableEntityTable,
  StatusTabs,
  type EntityStatusFilter,
} from "@/components/data-table/archivable-entity-table";
import { ArchiveRowActions } from "@/components/data-table/archive-row-actions";
import {
  archiveVaultEntry,
  restoreVaultEntry,
  deleteVaultEntry,
} from "@/actions/vault";

export default async function VaultPage({
  params,
  searchParams,
}: {
  params: Promise<{ org: string }>;
  searchParams: Promise<{ status?: string }>;
}) {
  const { org } = await params;
  const { status } = await searchParams;
  const ctx = await getOrgContext(org);

  // Vault visibility is a real security boundary, not just a hidden nav
  // item -- EMPLOYEE role gets a 404 here, same as any other org resource
  // they have no business touching.
  if (!can(ctx, "vault", "view")) {
    notFound();
  }

  const activeTab: EntityStatusFilter =
    status === "ARCHIVED" ? "ARCHIVED" : "ACTIVE";

  // Security fix (external review, 2026-09-13): a grant-scoped (OWN) role
  // only sees entries it's been explicitly granted — see
  // lib/vault-scope.ts's own comment for why this can't reuse
  // lib/scope.ts's assignedEmployeeId-based buildScopeWhere.
  const entries = await prisma.vaultServiceEntry.findMany({
    where: { orgId: ctx.orgId, status: activeTab, ...buildVaultScopeWhere(ctx) },
    orderBy: { createdAt: "desc" },
    include: { tags: { include: { tag: true } } },
  });

  const canEdit = can(ctx, "vault", "edit");

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Пароли</h1>
        {canEdit && (
          <Button render={<Link href={`/${org}/vault/new`} />}>
            Добавить сервис
          </Button>
        )}
      </div>

      <StatusTabs basePath={`/${org}/vault`} active={activeTab} />

      <ArchivableEntityTable
        data={entries}
        emptyMessage={
          activeTab === "ACTIVE" ? "Записей пока нет" : "В архиве пусто"
        }
        rowHref={(row) => `/${org}/vault/${row.id}`}
        columns={[
          { header: "Сервис", cell: (row) => row.serviceName },
          { header: "Логин", cell: (row) => row.username ?? "—" },
          {
            header: "Доступ",
            cell: (row) =>
              row.tags.length === 0 ? (
                <span className="text-muted-foreground">—</span>
              ) : (
                <div className="flex flex-wrap gap-1">
                  {row.tags.map(({ tag }) => (
                    <Badge key={tag.id} variant="secondary">
                      {tag.name}
                    </Badge>
                  ))}
                </div>
              ),
          },
        ]}
        rowActions={
          canEdit
            ? (row) => (
                <ArchiveRowActions
                  status={row.status}
                  onArchive={archiveVaultEntry.bind(null, org, row.id)}
                  onRestore={restoreVaultEntry.bind(null, org, row.id)}
                  onDelete={deleteVaultEntry.bind(null, org, row.id)}
                  deleteTitle="Удалить запись сервиса?"
                  deleteDescription="Если доступ к этому сервису выдан хотя бы одному сотруднику, запись будет перемещена в архив вместо удаления."
                />
              )
            : undefined
        }
      />
    </div>
  );
}

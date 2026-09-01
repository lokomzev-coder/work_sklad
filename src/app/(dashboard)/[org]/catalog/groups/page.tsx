import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getOrgContext } from "@/lib/tenant";
import { can } from "@/lib/permissions";
import { flattenGroupTree } from "@/lib/catalog-groups";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "@/components/ui/table";
import { CatalogSubnav } from "@/components/catalog/catalog-subnav";
import { SimpleDeleteButton } from "@/components/data-table/simple-delete-button";
import { deleteCatalogGroup } from "@/actions/catalog-groups";

export default async function CatalogGroupsPage({
  params,
}: {
  params: Promise<{ org: string }>;
}) {
  const { org } = await params;
  const ctx = await getOrgContext(org);
  if (!can(ctx, "catalog", "view")) notFound();
  const canEdit = can(ctx, "catalog", "edit");

  const groups = await prisma.catalogGroup.findMany({
    where: { orgId: ctx.orgId },
    orderBy: { name: "asc" },
  });
  const nodes = flattenGroupTree(groups);

  return (
    <div className="flex flex-col gap-4">
      <CatalogSubnav org={org} active="groups" />
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Группы товаров</h1>
        {canEdit && (
          <Button render={<Link href={`/${org}/catalog/groups/new`} />}>
            Добавить
          </Button>
        )}
      </div>

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Название</TableHead>
              {canEdit && <TableHead className="w-0" />}
            </TableRow>
          </TableHeader>
          <TableBody>
            {nodes.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={canEdit ? 2 : 1}
                  className="text-center text-muted-foreground"
                >
                  Группы ещё не созданы
                </TableCell>
              </TableRow>
            ) : (
              nodes.map(({ group, depth }) => (
                <TableRow key={group.id}>
                  <TableCell>
                    {canEdit ? (
                      <Link
                        href={`/${org}/catalog/groups/${group.id}`}
                        className="block"
                        style={{ paddingLeft: `${depth * 1.5}rem` }}
                      >
                        {group.name}
                      </Link>
                    ) : (
                      <span style={{ paddingLeft: `${depth * 1.5}rem` }}>
                        {group.name}
                      </span>
                    )}
                  </TableCell>
                  {canEdit && (
                    <TableCell className="text-right">
                      <SimpleDeleteButton
                        onDelete={deleteCatalogGroup.bind(null, org, group.id)}
                        title="Удалить группу?"
                        description="Если группа содержит подгруппы или позиции каталога, удаление будет заблокировано."
                      />
                    </TableCell>
                  )}
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

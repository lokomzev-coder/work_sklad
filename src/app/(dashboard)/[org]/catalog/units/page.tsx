import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getOrgContext } from "@/lib/tenant";
import { can } from "@/lib/permissions";
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
import { deleteUnit } from "@/actions/units";

export default async function UnitsPage({
  params,
}: {
  params: Promise<{ org: string }>;
}) {
  const { org } = await params;
  const ctx = await getOrgContext(org);
  if (!can(ctx, "catalog", "view")) notFound();
  const canEdit = can(ctx, "catalog", "edit");

  const units = await prisma.unit.findMany({
    where: { orgId: ctx.orgId },
    orderBy: { name: "asc" },
  });

  return (
    <div className="flex flex-col gap-4">
      <CatalogSubnav org={org} active="units" />
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Единицы измерения</h1>
        {canEdit && (
          <Button render={<Link href={`/${org}/catalog/units/new`} />}>
            Добавить
          </Button>
        )}
      </div>

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Название</TableHead>
              <TableHead>Сокращение</TableHead>
              {canEdit && <TableHead className="w-0" />}
            </TableRow>
          </TableHeader>
          <TableBody>
            {units.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={canEdit ? 3 : 2}
                  className="text-center text-muted-foreground"
                >
                  Единицы измерения ещё не добавлены
                </TableCell>
              </TableRow>
            ) : (
              units.map((unit) => (
                <TableRow key={unit.id}>
                  <TableCell>
                    {canEdit ? (
                      <Link
                        href={`/${org}/catalog/units/${unit.id}`}
                        className="block"
                      >
                        {unit.name}
                      </Link>
                    ) : (
                      unit.name
                    )}
                  </TableCell>
                  <TableCell>{unit.shortName}</TableCell>
                  {canEdit && (
                    <TableCell className="text-right">
                      <SimpleDeleteButton
                        onDelete={deleteUnit.bind(null, org, unit.id)}
                        title="Удалить единицу измерения?"
                        description="Если единица используется в товарах или услугах, удаление будет заблокировано."
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

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
import { deleteCharacteristic } from "@/actions/characteristics";

export default async function CharacteristicsPage({
  params,
}: {
  params: Promise<{ org: string }>;
}) {
  const { org } = await params;
  const ctx = await getOrgContext(org);
  if (!can(ctx, "catalog", "view")) notFound();
  const canEdit = can(ctx, "catalog", "edit");

  const characteristics = await prisma.characteristic.findMany({
    where: { orgId: ctx.orgId },
    orderBy: { name: "asc" },
  });

  return (
    <div className="flex flex-col gap-4">
      <CatalogSubnav org={org} active="characteristics" />
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Характеристики</h1>
        {canEdit && (
          <Button render={<Link href={`/${org}/catalog/characteristics/new`} />}>
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
            {characteristics.length === 0 ? (
              <TableRow>
                <TableCell colSpan={canEdit ? 2 : 1} className="text-center text-muted-foreground">
                  Характеристики ещё не добавлены (например, «Размер», «Цвет»)
                </TableCell>
              </TableRow>
            ) : (
              characteristics.map((c) => (
                <TableRow key={c.id}>
                  <TableCell>{c.name}</TableCell>
                  {canEdit && (
                    <TableCell className="text-right">
                      <SimpleDeleteButton
                        onDelete={deleteCharacteristic.bind(null, org, c.id)}
                        title="Удалить характеристику?"
                        description="Если характеристика используется в модификациях товаров, удаление будет заблокировано."
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

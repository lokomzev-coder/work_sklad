import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getOrgContext } from "@/lib/tenant";
import { can } from "@/lib/permissions";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "@/components/ui/table";
import { WarehouseSubnav } from "@/components/warehouse/warehouse-subnav";

export default async function PickingWavesPage({
  params,
}: {
  params: Promise<{ org: string }>;
}) {
  const { org } = await params;
  const ctx = await getOrgContext(org);
  if (!can(ctx, "warehouse", "view")) notFound();

  const waves = await prisma.pickingWave.findMany({
    where: { orgId: ctx.orgId },
    orderBy: { number: "desc" },
    include: { _count: { select: { orders: true } } },
    take: 100,
  });

  return (
    <div className="flex flex-col gap-4">
      <WarehouseSubnav org={org} active="picking-waves" />
      <h1 className="text-2xl font-semibold">Волны отбора</h1>
      <p className="text-sm text-muted-foreground">
        Волна создаётся выбором нескольких заказов на странице{" "}
        <Link href={`/${org}/orders`} className="underline">
          Заказы
        </Link>
        .
      </p>

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>№</TableHead>
              <TableHead>Заказов</TableHead>
              <TableHead>Дата</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {waves.length === 0 ? (
              <TableRow>
                <TableCell colSpan={3} className="text-center text-muted-foreground">
                  Волн отбора пока нет
                </TableCell>
              </TableRow>
            ) : (
              waves.map((wave) => (
                <TableRow key={wave.id}>
                  <TableCell>
                    <Link href={`/${org}/warehouse/picking-waves/${wave.id}`} className="block font-medium hover:underline">
                      №{wave.number}
                    </Link>
                  </TableCell>
                  <TableCell>{wave._count.orders}</TableCell>
                  <TableCell>{wave.createdAt.toLocaleDateString("ru-RU")}</TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getOrgContext } from "@/lib/tenant";
import { can } from "@/lib/permissions";
import { buildScopeWhere } from "@/lib/scope";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "@/components/ui/table";
import { ProductionSubnav } from "@/components/production/production-subnav";
import { statusBadgeClass } from "@/lib/status-color";

export default async function ProductionOrdersPage({
  params,
}: {
  params: Promise<{ org: string }>;
}) {
  const { org } = await params;
  const ctx = await getOrgContext(org);
  if (!can(ctx, "productionOrders", "view")) notFound();

  const scopeWhere = await buildScopeWhere(ctx, "productionOrders");
  const productionOrders = await prisma.productionOrder.findMany({
    where: { orgId: ctx.orgId, ...scopeWhere },
    orderBy: { number: "desc" },
    include: {
      techCard: { include: { outputItem: true } },
      materialsStore: true,
      productsStore: true,
      status: true,
      assignedEmployee: true,
    },
  });

  const canCreate = can(ctx, "productionOrders", "create");

  return (
    <div className="flex flex-col gap-4">
      <ProductionSubnav org={org} active="tasks" />
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Производственные задания</h1>
        {canCreate && (
          <Button render={<Link href={`/${org}/production/new`} />}>Новое задание</Button>
        )}
      </div>

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>№</TableHead>
              <TableHead>Выпуск</TableHead>
              <TableHead>Склад</TableHead>
              <TableHead>Статус</TableHead>
              <TableHead>Сотрудник</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {productionOrders.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="text-center text-muted-foreground">
                  Производственных заданий пока нет
                </TableCell>
              </TableRow>
            ) : (
              productionOrders.map((po) => (
                <TableRow key={po.id}>
                  <TableCell>
                    <Link href={`/${org}/production/${po.id}`} className="font-medium hover:underline">
                      №{po.number}
                    </Link>
                  </TableCell>
                  <TableCell>
                    {po.quantity.toString()} × {po.techCard.outputItem.name}
                  </TableCell>
                  <TableCell>
                    {po.materialsStoreId === po.productsStoreId
                      ? po.materialsStore.name
                      : `${po.materialsStore.name} → ${po.productsStore.name}`}
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline" className={statusBadgeClass(po.status.color)}>
                      {po.status.name}
                    </Badge>
                  </TableCell>
                  <TableCell>{po.assignedEmployee?.fullName ?? "—"}</TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

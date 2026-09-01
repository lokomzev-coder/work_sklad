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
import { statusBadgeClass } from "@/lib/status-color";
import { formatMoney } from "@/lib/format";

export default async function PurchaseOrdersPage({
  params,
}: {
  params: Promise<{ org: string }>;
}) {
  const { org } = await params;
  const ctx = await getOrgContext(org);
  if (!can(ctx, "purchaseOrders", "view")) notFound();

  const scopeWhere = await buildScopeWhere(ctx, "purchaseOrders");
  const purchaseOrders = await prisma.purchaseOrder.findMany({
    where: { orgId: ctx.orgId, ...scopeWhere },
    orderBy: { number: "desc" },
    include: { supplier: true, lineItems: true, status: true },
  });

  const canCreate = can(ctx, "purchaseOrders", "create");

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Заказы поставщику</h1>
        {canCreate && (
          <Button render={<Link href={`/${org}/purchase-orders/new`} />}>
            Новый заказ
          </Button>
        )}
      </div>

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>№</TableHead>
              <TableHead>Поставщик</TableHead>
              <TableHead>Статус</TableHead>
              <TableHead className="text-right">Сумма</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {purchaseOrders.length === 0 ? (
              <TableRow>
                <TableCell colSpan={4} className="text-center text-muted-foreground">
                  Заказов поставщику пока нет
                </TableCell>
              </TableRow>
            ) : (
              purchaseOrders.map((po) => {
                const total = po.lineItems.reduce(
                  (sum, li) => sum + Number(li.unitPriceSnapshot) * Number(li.quantity),
                  0,
                );
                const currency = po.lineItems[0]?.currency ?? "RUB";
                return (
                  <TableRow key={po.id}>
                    <TableCell>
                      <Link href={`/${org}/purchase-orders/${po.id}`} className="font-medium hover:underline">
                        №{po.number}
                      </Link>
                    </TableCell>
                    <TableCell>{po.supplier?.name ?? "—"}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className={statusBadgeClass(po.status.color)}>
                        {po.status.name}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">{formatMoney(total, currency)}</TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

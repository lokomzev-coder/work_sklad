import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { getOrgContext } from "@/lib/tenant";
import { can } from "@/lib/permissions";
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

const STATUS_LABEL: Record<string, string> = {
  DRAFT: "Черновик",
  CONFIRMED: "Подтверждён",
  COMPLETED: "Завершён",
  CANCELLED: "Отменён",
};

export default async function PurchaseOrdersPage({
  params,
}: {
  params: Promise<{ org: string }>;
}) {
  const { org } = await params;
  const ctx = await getOrgContext(org);

  const purchaseOrders = await prisma.purchaseOrder.findMany({
    where: { orgId: ctx.orgId },
    orderBy: { number: "desc" },
    include: { supplier: true, lineItems: true },
  });

  const canEdit = can(ctx.role, "orders", "edit");

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Заказы поставщику</h1>
        {canEdit && (
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
                return (
                  <TableRow key={po.id}>
                    <TableCell>
                      <Link href={`/${org}/purchase-orders/${po.id}`} className="font-medium hover:underline">
                        №{po.number}
                      </Link>
                    </TableCell>
                    <TableCell>{po.supplier?.name ?? "—"}</TableCell>
                    <TableCell>
                      <Badge variant="secondary">{STATUS_LABEL[po.status]}</Badge>
                    </TableCell>
                    <TableCell className="text-right">{total.toFixed(2)} ₽</TableCell>
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

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
import { OrdersSubnav } from "@/components/orders/orders-subnav";
import { QuerySelectFilter } from "@/components/forms/query-select-filter";
import { statusBadgeClass } from "@/lib/status-color";
import { formatMoney } from "@/lib/format";

export default async function OrdersPage({
  params,
  searchParams,
}: {
  params: Promise<{ org: string }>;
  searchParams: Promise<{ channel?: string }>;
}) {
  const { org } = await params;
  const { channel } = await searchParams;
  const ctx = await getOrgContext(org);

  const [orders, salesChannels] = await Promise.all([
    prisma.order.findMany({
      where: {
        orgId: ctx.orgId,
        // Block I: an OWN-scoped custom role only sees orders assigned to
        // their own Employee record.
        ...(ctx.orderScope === "OWN" ? { assignedEmployeeId: ctx.employeeId } : {}),
        ...(channel ? { salesChannelId: channel } : {}),
      },
      orderBy: { number: "desc" },
      include: { client: true, lineItems: true, status: true },
    }),
    prisma.salesChannel.findMany({ where: { orgId: ctx.orgId }, orderBy: { name: "asc" } }),
  ]);

  const canEdit = can(ctx.role, "orders", "edit");

  return (
    <div className="flex flex-col gap-4">
      <OrdersSubnav org={org} active="orders" />
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Заказы</h1>
        {canEdit && (
          <Button render={<Link href={`/${org}/orders/new`} />}>
            Новый заказ
          </Button>
        )}
      </div>

      {salesChannels.length > 0 && (
        <QuerySelectFilter
          basePath={`/${org}/orders`}
          paramName="channel"
          value={channel ?? ""}
          allLabel="Все каналы продаж"
          options={salesChannels.map((c) => ({ value: c.id, label: c.name }))}
        />
      )}

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>№</TableHead>
              <TableHead>Клиент</TableHead>
              <TableHead>Статус</TableHead>
              <TableHead className="text-right">Сумма</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {orders.length === 0 ? (
              <TableRow>
                <TableCell colSpan={4} className="text-center text-muted-foreground">
                  Заказов пока нет
                </TableCell>
              </TableRow>
            ) : (
              orders.map((order) => {
                const total = order.lineItems.reduce(
                  (sum, li) => sum + Number(li.unitPriceSnapshot) * Number(li.quantity),
                  0,
                );
                const currency = order.lineItems[0]?.currency ?? "RUB";
                return (
                  <TableRow key={order.id}>
                    <TableCell>
                      <Link href={`/${org}/orders/${order.id}`} className="font-medium hover:underline">
                        №{order.number}
                      </Link>
                    </TableCell>
                    <TableCell>{order.client?.name ?? "—"}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className={statusBadgeClass(order.status.color)}>
                        {order.status.name}
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

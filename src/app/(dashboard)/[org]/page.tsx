import Link from "next/link";
import { notFound } from "next/navigation";
import { Users, Contact, Package, ShoppingCart } from "lucide-react";
import { prisma, withDbRetry } from "@/lib/prisma";
import { getOrgContext } from "@/lib/tenant";
import { can } from "@/lib/permissions";
import { buildScopeWhere, resolveGroupMemberIds } from "@/lib/scope";
import { getOrgBaseCurrency } from "@/lib/currency";
import { getCurrencyIcon } from "@/lib/currency-icons";
import { formatMoney } from "@/lib/format";
import { statusBadgeClass } from "@/lib/status-color";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { KpiCard } from "@/components/dashboard/kpi-card";
import { AreaTrendChart } from "@/components/charts/area-trend-chart";
import { StatusDonutChart } from "@/components/charts/status-donut-chart";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "@/components/ui/table";

const TREND_DAYS = 14;

export default async function OrgDashboardPage({
  params,
}: {
  params: Promise<{ org: string }>;
}) {
  const { org } = await params;
  const ctx = await getOrgContext(org);
  if (!can(ctx, "dashboard", "view")) notFound();

  // Block I2.1: a scoped custom role only sees/counts/sums orders assigned
  // to them (OWN) or their department (OWN_GROUP) — same rule as the
  // /orders list page, applied here too so the dashboard doesn't leak other
  // employees' orders.
  const scopeWhere = await buildScopeWhere(ctx, "orders");
  const ordersWhere = { orgId: ctx.orgId, ...scopeWhere };
  const scopedEmployeeIds =
    ctx.capabilities.orders.view === "OWN"
      ? [ctx.employeeId ?? "__none__"]
      : ctx.capabilities.orders.view === "OWN_GROUP"
        ? ctx.groupId
          ? await resolveGroupMemberIds(ctx.orgId, ctx.groupId)
          : []
        : null; // null = unscoped (ALL)

  const now = new Date();
  const trendFrom = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - (TREND_DAYS - 1)),
  );

  // Block: split into two smaller sequential batches instead of one 9-wide
  // Promise.all. The local `prisma dev` proxy doesn't just go stale on idle
  // sockets (see the pool comment in lib/prisma.ts) — it also chokes when
  // ~9-10 brand-new connections are opened in the same instant, failing with
  // "Server has closed the connection" even on an immediate retry of the
  // exact same burst. Two ~4-5-wide batches roughly halve the peak
  // concurrent connection-open spike; each is still wrapped in withDbRetry
  // as a second layer, safe here since every query is read-only.
  const [employeeCount, clientCount, catalogCount, orderCount, recentOrders] = await withDbRetry(() =>
    Promise.all([
      prisma.employee.count({ where: { orgId: ctx.orgId, status: "ACTIVE" } }),
      prisma.client.count({ where: { orgId: ctx.orgId, status: "ACTIVE" } }),
      prisma.catalogItem.count({ where: { orgId: ctx.orgId, status: "ACTIVE" } }),
      prisma.order.count({ where: ordersWhere }),
      prisma.order.findMany({
        where: ordersWhere,
        orderBy: { number: "desc" },
        take: 5,
        include: { client: true, lineItems: true, status: true },
      }),
    ]),
  );

  const [allOrdersForBreakdown, trendLines, revenueRows, baseCurrency] = await withDbRetry(() =>
    Promise.all([
      prisma.order.findMany({
        where: ordersWhere,
        select: { status: { select: { name: true, color: true } } },
      }),
      prisma.orderLineItem.findMany({
        where: { order: { ...ordersWhere, createdAt: { gte: trendFrom } } },
        select: {
          quantity: true,
          unitPriceSnapshot: true,
          order: { select: { createdAt: true } },
        },
      }),
      scopedEmployeeIds
        ? prisma.$queryRaw<{ total: string | null }[]>`
            SELECT SUM(oli."quantity" * oli."unitPriceSnapshot") as total
            FROM "OrderLineItem" oli
            JOIN "Order" o ON o.id = oli."orderId"
            WHERE o."orgId" = ${ctx.orgId} AND o."assignedEmployeeId" = ANY(${scopedEmployeeIds})
          `
        : prisma.$queryRaw<{ total: string | null }[]>`
            SELECT SUM(oli."quantity" * oli."unitPriceSnapshot") as total
            FROM "OrderLineItem" oli
            JOIN "Order" o ON o.id = oli."orderId"
            WHERE o."orgId" = ${ctx.orgId}
          `,
      getOrgBaseCurrency(ctx.orgId),
    ]),
  );

  const totalRevenue = Number(revenueRows[0]?.total ?? 0);

  const dayKey = (d: Date) => d.toISOString().slice(0, 10);
  const dailyMap = new Map<string, number>();
  for (let i = 0; i < TREND_DAYS; i++) {
    const d = new Date(trendFrom);
    d.setUTCDate(d.getUTCDate() + i);
    dailyMap.set(dayKey(d), 0);
  }
  for (const line of trendLines) {
    const key = dayKey(line.order.createdAt);
    if (!dailyMap.has(key)) continue;
    dailyMap.set(key, (dailyMap.get(key) ?? 0) + Number(line.unitPriceSnapshot) * Number(line.quantity));
  }
  const revenueSeries = [...dailyMap.entries()].map(([date, revenue]) => ({ date, revenue }));

  const statusMap = new Map<string, { name: string; color: string; count: number }>();
  for (const o of allOrdersForBreakdown) {
    const row = statusMap.get(o.status.name) ?? { name: o.status.name, color: o.status.color, count: 0 };
    row.count += 1;
    statusMap.set(o.status.name, row);
  }

  const stats = [
    { label: "Сотрудники", value: employeeCount, href: `/${org}/employees`, icon: Users },
    { label: "Клиенты", value: clientCount, href: `/${org}/clients`, icon: Contact },
    { label: "Товары и услуги", value: catalogCount, href: `/${org}/catalog`, icon: Package },
    { label: "Заказы", value: orderCount, href: `/${org}/orders`, icon: ShoppingCart },
  ];

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Дашборд</h1>
        <Link href={`/${org}/reports/overview`} className="text-sm text-primary hover:underline">
          Полная отчётность →
        </Link>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-5">
        {stats.map((stat) => (
          <KpiCard key={stat.href} label={stat.label} value={String(stat.value)} icon={stat.icon} href={stat.href} />
        ))}
        <KpiCard label="Выручка (все заказы)" value={formatMoney(totalRevenue, baseCurrency)} icon={getCurrencyIcon(baseCurrency)} />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-base">Выручка за {TREND_DAYS} дней</CardTitle>
          </CardHeader>
          <CardContent>
            <AreaTrendChart
              data={revenueSeries}
              series={[{ key: "revenue", label: "Выручка", color: "var(--chart-1)" }]}
              format={{ kind: "money", currency: baseCurrency }}
              className="h-56 w-full"
            />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Заказы по статусам</CardTitle>
          </CardHeader>
          <CardContent>
            <StatusDonutChart data={[...statusMap.values()]} className="h-56 w-full" />
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Последние заказы</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
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
              {recentOrders.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={4} className="text-center text-muted-foreground">
                    Заказов пока нет
                  </TableCell>
                </TableRow>
              ) : (
                recentOrders.map((order) => {
                  const total = order.lineItems.reduce(
                    (sum, li) => sum + Number(li.unitPriceSnapshot) * Number(li.quantity),
                    0,
                  );
                  return (
                    <TableRow key={order.id}>
                      <TableCell>
                        <Link
                          href={`/${org}/orders/${order.id}`}
                          className="font-medium hover:underline"
                        >
                          №{order.number}
                        </Link>
                      </TableCell>
                      <TableCell>{order.client?.name ?? "—"}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className={statusBadgeClass(order.status.color)}>
                          {order.status.name}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">{formatMoney(total, baseCurrency)}</TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}

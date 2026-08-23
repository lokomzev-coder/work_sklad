import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { getOrgContext } from "@/lib/tenant";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "@/components/ui/table";

export default async function OrgDashboardPage({
  params,
}: {
  params: Promise<{ org: string }>;
}) {
  const { org } = await params;
  const ctx = await getOrgContext(org);

  const [employeeCount, clientCount, catalogCount, orderCount, recentOrders, revenueRows] =
    await Promise.all([
      prisma.employee.count({ where: { orgId: ctx.orgId, status: "ACTIVE" } }),
      prisma.client.count({ where: { orgId: ctx.orgId, status: "ACTIVE" } }),
      prisma.catalogItem.count({ where: { orgId: ctx.orgId, status: "ACTIVE" } }),
      prisma.order.count({ where: { orgId: ctx.orgId } }),
      prisma.order.findMany({
        where: { orgId: ctx.orgId },
        orderBy: { number: "desc" },
        take: 5,
        include: { client: true, lineItems: true, status: true },
      }),
      prisma.$queryRaw<{ total: string | null }[]>`
        SELECT SUM(oli."quantity" * oli."unitPriceSnapshot") as total
        FROM "OrderLineItem" oli
        JOIN "Order" o ON o.id = oli."orderId"
        WHERE o."orgId" = ${ctx.orgId}
      `,
    ]);

  const totalRevenue = Number(revenueRows[0]?.total ?? 0);

  const stats = [
    { label: "Сотрудники", value: employeeCount, href: `/${org}/employees` },
    { label: "Клиенты", value: clientCount, href: `/${org}/clients` },
    { label: "Товары и услуги", value: catalogCount, href: `/${org}/catalog` },
    { label: "Заказы", value: orderCount, href: `/${org}/orders` },
  ];

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold">Дашборд</h1>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {stats.map((stat) => (
          <Link key={stat.href} href={stat.href}>
            <Card className="transition-colors hover:bg-accent/50">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-normal text-muted-foreground">
                  {stat.label}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-semibold">{stat.value}</div>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Сумма по всем заказам</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-semibold">
            {totalRevenue.toLocaleString("ru-RU", { minimumFractionDigits: 2 })} ₽
          </div>
        </CardContent>
      </Card>

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
                        <Badge variant="secondary">{order.status.name}</Badge>
                      </TableCell>
                      <TableCell className="text-right">{total.toFixed(2)} ₽</TableCell>
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

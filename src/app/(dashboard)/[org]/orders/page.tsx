import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getOrgContext } from "@/lib/tenant";
import { can } from "@/lib/permissions";
import { buildScopeWhere } from "@/lib/scope";
import { Button } from "@/components/ui/button";
import { OrdersSubnav } from "@/components/orders/orders-subnav";
import { OrdersSelectableTable } from "@/components/orders/orders-selectable-table";
import { QuerySelectFilter } from "@/components/forms/query-select-filter";

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
  if (!can(ctx, "orders", "view")) notFound();

  const scopeWhere = await buildScopeWhere(ctx, "orders");
  const [orders, salesChannels] = await Promise.all([
    prisma.order.findMany({
      where: {
        orgId: ctx.orgId,
        ...scopeWhere,
        ...(channel ? { salesChannelId: channel } : {}),
      },
      orderBy: { number: "desc" },
      include: { client: true, lineItems: true, status: true },
    }),
    prisma.salesChannel.findMany({ where: { orgId: ctx.orgId }, orderBy: { name: "asc" } }),
  ]);

  const canCreate = can(ctx, "orders", "create");

  return (
    <div className="flex flex-col gap-4">
      <OrdersSubnav org={org} active="orders" />
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Заказы</h1>
        {canCreate && (
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

      <OrdersSelectableTable
        orgSlug={org}
        canCreateWave={can(ctx, "warehouse", "create")}
        orders={orders.map((order) => {
          const total = order.lineItems.reduce(
            (sum, li) => sum + Number(li.unitPriceSnapshot) * Number(li.quantity),
            0,
          );
          const currency = order.lineItems[0]?.currency ?? "RUB";
          return {
            id: order.id,
            number: order.number,
            clientName: order.client?.name ?? "—",
            statusName: order.status.name,
            statusColor: order.status.color,
            total,
            currency,
          };
        })}
      />
    </div>
  );
}

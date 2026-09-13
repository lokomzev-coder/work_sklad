import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getOrgContext } from "@/lib/tenant";
import { can } from "@/lib/permissions";
import { getOrderRemainingByKey, lineKey } from "@/lib/orders";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "@/components/ui/table";
import { variantLabel } from "@/lib/catalog-variants";
import { CreateWaveDemandsButton } from "@/components/warehouse/create-wave-demands-button";

export default async function PickingWaveDetailPage({
  params,
}: {
  params: Promise<{ org: string; id: string }>;
}) {
  const { org, id } = await params;
  const ctx = await getOrgContext(org);
  if (!can(ctx, "warehouse", "view")) notFound();

  const wave = await prisma.pickingWave.findFirst({
    where: { id, orgId: ctx.orgId },
    include: {
      orders: {
        include: { order: { include: { client: true, status: true } } },
      },
    },
  });
  if (!wave) {
    notFound();
  }

  const orderIds = wave.orders.map((wo) => wo.orderId);

  // Per-order remaining lines, aggregated across the whole wave — same
  // remaining-quantity source every other "Создать документ" action uses
  // (lib/orders.ts::getOrderRemainingByKey), just summed across N orders
  // instead of one.
  const remainingByOrder = await Promise.all(
    wave.orders.map(async (wo) => ({
      order: wo.order,
      remaining: await getOrderRemainingByKey(prisma, wo.orderId),
    })),
  );

  const aggregated = new Map<
    string,
    { catalogItemId: string; variantId: string | null; total: number; byOrder: { orderNumber: number; quantity: number }[] }
  >();
  for (const { order, remaining } of remainingByOrder) {
    for (const line of remaining.values()) {
      if (line.quantity <= 0) continue;
      const key = lineKey(line.catalogItemId, line.variantId);
      const existing = aggregated.get(key);
      const entry = existing ?? {
        catalogItemId: line.catalogItemId,
        variantId: line.variantId,
        total: 0,
        byOrder: [],
      };
      entry.total += line.quantity;
      entry.byOrder.push({ orderNumber: order.number, quantity: line.quantity });
      aggregated.set(key, entry);
    }
  }

  const catalogItemIds = [...new Set([...aggregated.values()].map((a) => a.catalogItemId))];
  const catalogItems = await prisma.catalogItem.findMany({
    where: { id: { in: catalogItemIds } },
    include: { variants: { include: { values: { include: { characteristic: true } } } } },
  });
  const catalogItemById = new Map(catalogItems.map((c) => [c.id, c]));

  const demands = await prisma.stockMovement.findMany({
    where: { orderId: { in: orderIds }, type: "DEMAND" },
    include: { store: true, order: true },
    orderBy: { number: "asc" },
  });

  return (
    <div className="flex max-w-2xl flex-col gap-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Волна отбора №{wave.number}</h1>
        {can(ctx, "warehouse", "create") && <CreateWaveDemandsButton orgSlug={org} waveId={wave.id} />}
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Заказы волны</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>№</TableHead>
                  <TableHead>Клиент</TableHead>
                  <TableHead>Статус</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {wave.orders.map((wo) => (
                  <TableRow key={wo.id}>
                    <TableCell>
                      <Link href={`/${org}/orders/${wo.orderId}`} className="underline">
                        №{wo.order.number}
                      </Link>
                    </TableCell>
                    <TableCell>{wo.order.client?.name ?? "—"}</TableCell>
                    <TableCell>{wo.order.status.name}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Собрать (сумма по всем заказам волны)</CardTitle>
        </CardHeader>
        <CardContent>
          {aggregated.size === 0 ? (
            <p className="text-sm text-muted-foreground">Собирать нечего — по всем заказам волны уже всё отгружено</p>
          ) : (
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Товар</TableHead>
                    <TableHead className="text-right">Всего</TableHead>
                    <TableHead>По заказам</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {[...aggregated.values()].map((row) => {
                    const item = catalogItemById.get(row.catalogItemId);
                    const variant = row.variantId ? item?.variants.find((v) => v.id === row.variantId) : undefined;
                    const name =
                      (item?.name ?? "—") +
                      (variant ? ` — ${variantLabel(variant.values) || (variant.sku ?? variant.id)}` : "");
                    return (
                      <TableRow key={lineKey(row.catalogItemId, row.variantId)}>
                        <TableCell>{name}</TableCell>
                        <TableCell className="text-right">{row.total}</TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {row.byOrder.map((b) => `№${b.orderNumber}: ${b.quantity}`).join(", ")}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {demands.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Отгрузки по заказам волны</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>№</TableHead>
                    <TableHead>Заказ</TableHead>
                    <TableHead>Склад</TableHead>
                    <TableHead>Статус</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {demands.map((d) => (
                    <TableRow key={d.id}>
                      <TableCell>
                        <Link href={`/${org}/warehouse/${d.id}`} className="underline">
                          №{d.number}
                        </Link>
                      </TableCell>
                      <TableCell>
                        {d.order && (
                          <Link href={`/${org}/orders/${d.order.id}`} className="underline">
                            №{d.order.number}
                          </Link>
                        )}
                      </TableCell>
                      <TableCell>{d.store.name}</TableCell>
                      <TableCell>
                        <Badge variant={d.isPosted ? "default" : "secondary"}>
                          {d.isPosted ? "Проведено" : "Черновик"}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

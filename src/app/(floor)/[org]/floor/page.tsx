import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { getOrgContext } from "@/lib/tenant";
import { buildScopeWhere } from "@/lib/scope";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { statusBadgeClass } from "@/lib/status-color";

export default async function FloorOrdersPage({
  params,
}: {
  params: Promise<{ org: string }>;
}) {
  const { org } = await params;
  const ctx = await getOrgContext(org);
  const scopeWhere = await buildScopeWhere(ctx, "productionOrders");

  const productionOrders = await prisma.productionOrder.findMany({
    where: {
      orgId: ctx.orgId,
      completedAt: null,
      ...scopeWhere,
    },
    orderBy: { number: "desc" },
    include: {
      techCard: { include: { outputItem: true } },
      status: true,
    },
  });

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-2xl font-semibold">Мои задания</h1>
      {productionOrders.length === 0 ? (
        <p className="text-muted-foreground">Активных заданий нет</p>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {productionOrders.map((po) => (
            <Link key={po.id} href={`/${org}/floor/${po.id}`}>
              <Card className="h-full transition-colors hover:bg-accent">
                <CardHeader>
                  <CardTitle className="flex items-center justify-between text-base">
                    <span>№{po.number}</span>
                    <Badge variant="outline" className={statusBadgeClass(po.status.color)}>
                      {po.status.name}
                    </Badge>
                  </CardTitle>
                </CardHeader>
                <CardContent className="text-sm text-muted-foreground">
                  {po.quantity.toString()} × {po.techCard.outputItem.name}
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

import { notFound } from "next/navigation";
import { prisma, withDbRetry } from "@/lib/prisma";
import { getOrgContext } from "@/lib/tenant";
import { can } from "@/lib/permissions";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "@/components/ui/table";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { formatMoney } from "@/lib/format";

/** Read-only overview of retail activity for ADMIN/MANAGER, mirroring
 * МойСклад's "Розница" tab in the main interface — the actual checkout
 * register only exists at /kassa (see (kassa) route group). */
export default async function RetailOverviewPage({
  params,
}: {
  params: Promise<{ org: string }>;
}) {
  const { org } = await params;
  const ctx = await getOrgContext(org);
  if (!can(ctx, "retail", "view")) notFound();

  // Sequential, not Promise.all: these three queries carry heavier `include`
  // clauses than the dashboard's simple counts, and the local `prisma dev`
  // proxy is documented (see (dashboard)/[org]/page.tsx) to drop connections
  // under simultaneous bursts even at low concurrency when queries run
  // longer — one at a time avoids that burst entirely. Each call is still
  // wrapped in withDbRetry individually since a lone query can still hit a
  // stale pooled connection.
  const sales = await withDbRetry(() =>
    prisma.retailSale.findMany({
      where: { orgId: ctx.orgId },
      orderBy: { number: "desc" },
      take: 100,
      include: { client: true, store: true, lineItems: true, payment: true, fiscalReceipt: true },
    }),
  );
  const returns = await withDbRetry(() =>
    prisma.retailReturn.findMany({
      where: { orgId: ctx.orgId },
      orderBy: { number: "desc" },
      take: 100,
      include: { client: true, store: true, lineItems: true, payment: true },
    }),
  );
  const shifts = await withDbRetry(() =>
    prisma.retailShift.findMany({
      where: { orgId: ctx.orgId },
      orderBy: { openedAt: "desc" },
      take: 100,
      include: { store: true, openedBy: true, closedBy: true },
    }),
  );

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-2xl font-semibold">Розница</h1>

      <Tabs defaultValue="sales">
        <TabsList>
          <TabsTrigger value="sales">Продажи</TabsTrigger>
          <TabsTrigger value="returns">Возвраты</TabsTrigger>
          <TabsTrigger value="shifts">Смены</TabsTrigger>
        </TabsList>

        <TabsContent value="sales">
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>№</TableHead>
                  <TableHead>Точка продаж</TableHead>
                  <TableHead>Покупатель</TableHead>
                  <TableHead>Сумма</TableHead>
                  <TableHead>Оплата</TableHead>
                  <TableHead>Фискализация</TableHead>
                  <TableHead>Дата</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sales.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center text-muted-foreground">
                      Продаж пока нет
                    </TableCell>
                  </TableRow>
                ) : (
                  sales.map((s) => {
                    const total = s.lineItems.reduce(
                      (sum, li) => sum + Number(li.unitPriceSnapshot) * Number(li.quantity),
                      0,
                    );
                    const currency = s.lineItems[0]?.currency ?? "RUB";
                    return (
                      <TableRow key={s.id}>
                        <TableCell>№{s.number}</TableCell>
                        <TableCell>{s.store.name}</TableCell>
                        <TableCell>{s.client.isWalkIn ? "Розничный покупатель" : s.client.name}</TableCell>
                        <TableCell>{formatMoney(total, currency)}</TableCell>
                        <TableCell>{s.payment?.method === "CARD" ? "Картой" : "Наличными"}</TableCell>
                        <TableCell>
                          {s.fiscalReceipt ? (
                            <Badge variant={s.fiscalReceipt.status === "REGISTERED" ? "default" : s.fiscalReceipt.status === "FAILED" ? "destructive" : "secondary"}>
                              {s.fiscalReceipt.status === "REGISTERED"
                                ? "Зарегистрирован"
                                : s.fiscalReceipt.status === "FAILED"
                                  ? "Ошибка"
                                  : "В обработке"}
                            </Badge>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </TableCell>
                        <TableCell>{s.createdAt.toLocaleString("ru-RU")}</TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </div>
        </TabsContent>

        <TabsContent value="returns">
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>№</TableHead>
                  <TableHead>Точка продаж</TableHead>
                  <TableHead>Покупатель</TableHead>
                  <TableHead>Сумма</TableHead>
                  <TableHead>Дата</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {returns.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center text-muted-foreground">
                      Возвратов пока нет
                    </TableCell>
                  </TableRow>
                ) : (
                  returns.map((r) => {
                    const total = r.lineItems.reduce(
                      (sum, li) => sum + Number(li.unitPriceSnapshot) * Number(li.quantity),
                      0,
                    );
                    const currency = r.lineItems[0]?.currency ?? "RUB";
                    return (
                      <TableRow key={r.id}>
                        <TableCell>№{r.number}</TableCell>
                        <TableCell>{r.store.name}</TableCell>
                        <TableCell>{r.client.isWalkIn ? "Розничный покупатель" : r.client.name}</TableCell>
                        <TableCell>{formatMoney(total, currency)}</TableCell>
                        <TableCell>{r.createdAt.toLocaleString("ru-RU")}</TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </div>
        </TabsContent>

        <TabsContent value="shifts">
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Точка продаж</TableHead>
                  <TableHead>Открыл</TableHead>
                  <TableHead>Закрыл</TableHead>
                  <TableHead>Статус</TableHead>
                  <TableHead>Открытие</TableHead>
                  <TableHead>Ожидалось / Пересчитано</TableHead>
                  <TableHead>Открыта</TableHead>
                  <TableHead>Закрыта</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {shifts.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={8} className="text-center text-muted-foreground">
                      Смен пока нет
                    </TableCell>
                  </TableRow>
                ) : (
                  shifts.map((sh) => (
                    <TableRow key={sh.id}>
                      <TableCell>{sh.store.name}</TableCell>
                      <TableCell>{sh.openedBy.fullName}</TableCell>
                      <TableCell>{sh.closedBy?.fullName ?? "—"}</TableCell>
                      <TableCell>
                        <Badge variant={sh.status === "OPEN" ? "default" : "secondary"}>
                          {sh.status === "OPEN" ? "Открыта" : "Закрыта"}
                        </Badge>
                      </TableCell>
                      <TableCell>{formatMoney(Number(sh.openingCashAmount), "RUB")}</TableCell>
                      <TableCell>
                        {sh.expectedCashAmount != null && sh.countedCashAmount != null
                          ? `${formatMoney(Number(sh.expectedCashAmount), "RUB")} / ${formatMoney(Number(sh.countedCashAmount), "RUB")}`
                          : "—"}
                      </TableCell>
                      <TableCell>{sh.openedAt.toLocaleString("ru-RU")}</TableCell>
                      <TableCell>{sh.closedAt ? sh.closedAt.toLocaleString("ru-RU") : "—"}</TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}

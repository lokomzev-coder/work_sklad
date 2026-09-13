import { notFound } from "next/navigation";
import { getOrgContext } from "@/lib/tenant";
import { can } from "@/lib/permissions";
import { getTurnoverReport, getTurnoverDailyReport, getStockTurnoverReport } from "@/lib/reports";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "@/components/ui/table";
import { Card, CardContent } from "@/components/ui/card";
import { ReportsSubnav } from "@/components/reports/reports-subnav";
import { PeriodFilter } from "@/components/reports/period-filter";
import { AreaTrendChart } from "@/components/charts/area-trend-chart";

export default async function TurnoverReportPage({
  params,
  searchParams,
}: {
  params: Promise<{ org: string }>;
  searchParams: Promise<{ from?: string; to?: string }>;
}) {
  const { org } = await params;
  const { from, to } = await searchParams;
  const ctx = await getOrgContext(org);
  if (!can(ctx, "reports", "view")) notFound();

  const range = {
    from: from ? new Date(from) : undefined,
    to: to ? new Date(`${to}T23:59:59`) : undefined,
  };
  const [rows, daily, turnoverTime] = await Promise.all([
    getTurnoverReport(ctx.orgId, range),
    getTurnoverDailyReport(ctx.orgId, range),
    getStockTurnoverReport(ctx.orgId, range),
  ]);

  return (
    <div className="flex flex-col gap-4">
      <ReportsSubnav org={org} active="turnover" />
      <h1 className="text-2xl font-semibold">Обороты</h1>
      <PeriodFilter from={from} to={to} />
      <p className="text-sm text-muted-foreground">
        Перемещения между складами не учитываются — это внутренний перенос, а не изменение
        общего остатка компании.
      </p>

      {daily.length > 0 ? (
        <Card>
          <CardContent className="pt-6">
            <AreaTrendChart
              data={daily}
              series={[
                { key: "qtyIn", label: "Приход", color: "var(--chart-1)" },
                { key: "qtyOut", label: "Расход", color: "var(--chart-4)" },
              ]}
              format={{ kind: "compact" }}
              className="h-64 w-full"
            />
          </CardContent>
        </Card>
      ) : (
        <p className="text-sm text-muted-foreground">
          Выберите период (оба поля «с» и «по») выше, чтобы увидеть график по дням.
        </p>
      )}

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Товар</TableHead>
              <TableHead className="text-right">Приход</TableHead>
              <TableHead className="text-right">Расход</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={3} className="text-center text-muted-foreground">
                  Движений за период нет
                </TableCell>
              </TableRow>
            ) : (
              rows.map((r) => (
                <TableRow key={r.catalogItemId}>
                  <TableCell>{r.catalogItemName}</TableCell>
                  <TableCell className="text-right">{r.qtyIn}</TableCell>
                  <TableCell className="text-right">{r.qtyOut}</TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {turnoverTime.length > 0 && (
        <>
          <h2 className="text-lg font-medium">Оборачиваемость (дней от прихода до расхода)</h2>
          <p className="text-sm text-muted-foreground">
            Среднее время от конкретной партии прихода до её фактического расхода (партионный
            учёт, FIFO) — чем меньше, тем быстрее товар оборачивается. Учитывает только продажи,
            для которых нашлась конкретная партия прихода.
          </p>
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Товар</TableHead>
                  <TableHead className="text-right">Ср. дней в остатке</TableHead>
                  <TableHead className="text-right">Продано (шт.)</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {turnoverTime.map((r) => (
                  <TableRow key={r.catalogItemId}>
                    <TableCell>{r.catalogItemName}</TableCell>
                    <TableCell className="text-right">{r.avgDaysInStock.toFixed(1)}</TableCell>
                    <TableCell className="text-right">{r.qtyConsumed}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </>
      )}
    </div>
  );
}

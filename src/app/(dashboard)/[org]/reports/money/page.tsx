import { notFound } from "next/navigation";
import { getOrgContext } from "@/lib/tenant";
import { can } from "@/lib/permissions";
import { getMoneyReport } from "@/lib/reports";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "@/components/ui/table";
import { ReportsSubnav } from "@/components/reports/reports-subnav";
import { PeriodFilter } from "@/components/reports/period-filter";
import { statusBadgeClass } from "@/lib/status-color";
import { formatMoney } from "@/lib/format";
import { cn } from "@/lib/utils";
import { ArrowDownLeft, ArrowUpRight } from "lucide-react";
import { AreaTrendChart } from "@/components/charts/area-trend-chart";
import { KpiCard } from "@/components/dashboard/kpi-card";
import type { ValueFormat } from "@/lib/format";

export default async function MoneyReportPage({
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
  const report = await getMoneyReport(ctx.orgId, range);

  return (
    <div className="flex flex-col gap-4">
      <ReportsSubnav org={org} active="money" />
      <h1 className="text-2xl font-semibold">Деньги</h1>
      <PeriodFilter from={from} to={to} />

      <div className="grid gap-4 sm:grid-cols-3">
        <KpiCard
          label="Поступления за период"
          value={formatMoney(report.periodIn, report.baseCurrency)}
          changePct={range.from && range.to ? report.periodInChangePct : undefined}
        />
        <KpiCard
          label="Выплаты за период"
          value={formatMoney(report.periodOut, report.baseCurrency)}
          changePct={range.from && range.to ? report.periodOutChangePct : undefined}
        />
        <KpiCard label="Текущий денежный остаток" value={formatMoney(report.currentBalance, report.baseCurrency)} />
      </div>

      {report.daily.length > 0 ? (
        <Card>
          <CardContent className="pt-6">
            <AreaTrendChart
              data={report.daily}
              series={[
                { key: "cashIn", label: "Приход", color: "var(--chart-1)" },
                { key: "cashOut", label: "Расход", color: "var(--chart-4)" },
              ]}
              format={{ kind: "money", currency: report.baseCurrency } satisfies ValueFormat}
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
              <TableHead>Дата</TableHead>
              <TableHead>Направление</TableHead>
              <TableHead>Контрагент</TableHead>
              <TableHead className="text-right">Сумма</TableHead>
              <TableHead>Комментарий</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {report.rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="text-center text-muted-foreground">
                  Платежей за период нет
                </TableCell>
              </TableRow>
            ) : (
              report.rows.map((r) => (
                <TableRow key={r.id}>
                  <TableCell>{r.createdAt.toLocaleDateString("ru-RU")}</TableCell>
                  <TableCell>
                    <Badge
                      variant="outline"
                      className={cn("gap-1", statusBadgeClass(r.direction === "IN" ? "green" : "orange"))}
                    >
                      {r.direction === "IN" ? (
                        <ArrowDownLeft className="size-3" />
                      ) : (
                        <ArrowUpRight className="size-3" />
                      )}
                      {r.direction === "IN" ? "Поступление" : "Выплата"}
                    </Badge>
                  </TableCell>
                  <TableCell>{r.counterpartyName}</TableCell>
                  <TableCell className="text-right">{formatMoney(r.amount, r.currency)}</TableCell>
                  <TableCell className="text-muted-foreground">{r.comment ?? "—"}</TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

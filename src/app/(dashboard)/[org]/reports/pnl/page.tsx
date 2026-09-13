import Link from "next/link";
import { notFound } from "next/navigation";
import { getOrgContext } from "@/lib/tenant";
import { can } from "@/lib/permissions";
import { getPnlReport, getPnlBreakdown, type PnlDimension } from "@/lib/reports";
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
import { AreaTrendChart } from "@/components/charts/area-trend-chart";
import { KpiCard } from "@/components/dashboard/kpi-card";
import { formatMoney } from "@/lib/format";
import type { ValueFormat } from "@/lib/format";
import { cn } from "@/lib/utils";

const DIMENSION_TABS: { key: PnlDimension; label: string }[] = [
  { key: "product", label: "По товару" },
  { key: "catalogGroup", label: "По группе" },
  { key: "client", label: "По клиенту" },
  { key: "employee", label: "По сотруднику" },
  { key: "salesChannel", label: "По каналу продаж" },
];

export default async function PnlReportPage({
  params,
  searchParams,
}: {
  params: Promise<{ org: string }>;
  searchParams: Promise<{ from?: string; to?: string; breakdown?: string }>;
}) {
  const { org } = await params;
  const { from, to, breakdown } = await searchParams;
  const ctx = await getOrgContext(org);
  if (!can(ctx, "reports", "view")) notFound();

  const range = {
    from: from ? new Date(from) : undefined,
    to: to ? new Date(`${to}T23:59:59`) : undefined,
  };
  const dimension = DIMENSION_TABS.find((t) => t.key === breakdown)?.key ?? null;

  const [report, breakdownReport] = await Promise.all([
    getPnlReport(ctx.orgId, range),
    dimension ? getPnlBreakdown(ctx.orgId, range, dimension) : Promise.resolve(null),
  ]);

  const qs = new URLSearchParams();
  if (from) qs.set("from", from);
  if (to) qs.set("to", to);

  return (
    <div className="flex flex-col gap-4">
      <ReportsSubnav org={org} active="pnl" />
      <h1 className="text-2xl font-semibold">Прибыли и убытки</h1>
      <PeriodFilter from={from} to={to} />
      <p className="text-sm text-muted-foreground">
        Выручка — по фактическим отгрузкам. Себестоимость проданного товара — партионно
        (FIFO): каждая продажа списывается по цене той конкретной партии закупки, из которой
        физически взят товар. Если партий закупки не хватает (остаток образован до включения
        партионного учёта или вручную), недостающее количество оценивается по последней
        известной закупочной цене. Себестоимость произведённого товара считается из стоимости
        списанного сырья (по последней известной закупочной цене, без партионного учёта сырья)
        плюс труд/накладные расходы техкарты. Годится как ориентир, не как точная бухгалтерская
        отчётность.
      </p>

      <div className="grid gap-4 sm:grid-cols-3">
        <KpiCard
          label="Выручка"
          value={formatMoney(report.revenue, report.baseCurrency)}
          changePct={range.from && range.to ? report.revenueChangePct : undefined}
        />
        <KpiCard label="Себестоимость" value={formatMoney(report.costOfGoods, report.baseCurrency)} />
        <KpiCard
          label="Валовая прибыль"
          value={formatMoney(report.grossMargin, report.baseCurrency)}
          changePct={range.from && range.to ? report.grossMarginChangePct : undefined}
        />
      </div>

      {report.daily.length > 0 ? (
        <Card>
          <CardContent className="pt-6">
            <AreaTrendChart
              data={report.daily}
              series={[
                { key: "revenue", label: "Выручка", color: "var(--chart-1)" },
                { key: "grossMargin", label: "Валовая прибыль", color: "var(--chart-2)" },
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

      <div className="flex flex-wrap gap-2">
        {DIMENSION_TABS.map((tab) => {
          // Clicking the already-active tab again turns the breakdown off
          // (tabQs then has no "breakdown" key at all).
          const tabQs = new URLSearchParams(qs);
          if (dimension !== tab.key) tabQs.set("breakdown", tab.key);
          return (
            <Link
              key={tab.key}
              href={`/${org}/reports/pnl?${tabQs.toString()}`}
              className={cn(
                "rounded-full px-4 py-2 text-sm font-semibold transition-colors",
                dimension === tab.key
                  ? "bg-primary text-primary-foreground"
                  : "bg-secondary text-secondary-foreground hover:text-foreground",
              )}
            >
              {tab.label}
            </Link>
          );
        })}
      </div>

      {breakdownReport && (
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{DIMENSION_TABS.find((t) => t.key === dimension)?.label}</TableHead>
                <TableHead className="text-right">Выручка</TableHead>
                <TableHead className="text-right">Себестоимость</TableHead>
                <TableHead className="text-right">Валовая прибыль</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {breakdownReport.rows.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={4} className="text-center text-muted-foreground">
                    Нет данных за период
                  </TableCell>
                </TableRow>
              ) : (
                breakdownReport.rows.map((row) => (
                  <TableRow key={row.key}>
                    <TableCell>{row.label}</TableCell>
                    <TableCell className="text-right">{formatMoney(row.revenue, breakdownReport.baseCurrency)}</TableCell>
                    <TableCell className="text-right">{formatMoney(row.costOfGoods, breakdownReport.baseCurrency)}</TableCell>
                    <TableCell className="text-right">
                      <span className={row.grossMargin < 0 ? "text-destructive" : ""}>
                        {formatMoney(row.grossMargin, breakdownReport.baseCurrency)}
                      </span>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}

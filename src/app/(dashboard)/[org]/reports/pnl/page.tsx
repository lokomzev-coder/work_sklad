import { getOrgContext } from "@/lib/tenant";
import { getPnlReport } from "@/lib/reports";
import { Card, CardContent } from "@/components/ui/card";
import { ReportsSubnav } from "@/components/reports/reports-subnav";
import { PeriodFilter } from "@/components/reports/period-filter";

export default async function PnlReportPage({
  params,
  searchParams,
}: {
  params: Promise<{ org: string }>;
  searchParams: Promise<{ from?: string; to?: string }>;
}) {
  const { org } = await params;
  const { from, to } = await searchParams;
  const ctx = await getOrgContext(org);

  const report = await getPnlReport(ctx.orgId, {
    from: from ? new Date(from) : undefined,
    to: to ? new Date(`${to}T23:59:59`) : undefined,
  });

  return (
    <div className="flex flex-col gap-4">
      <ReportsSubnav org={org} active="pnl" />
      <h1 className="text-2xl font-semibold">Прибыли и убытки</h1>
      <PeriodFilter from={from} to={to} />
      <p className="text-sm text-muted-foreground">
        Упрощённый расчёт: выручка — по фактическим отгрузкам, себестоимость — по фактическим
        приёмкам за тот же период (без партионного учёта себестоимости конкретной проданной
        единицы). Годится как ориентир, не как точная бухгалтерская отчётность.
      </p>

      <div className="grid gap-4 sm:grid-cols-3">
        <Card>
          <CardContent className="pt-6">
            <div className="text-sm text-muted-foreground">Выручка</div>
            <div className="text-xl font-semibold">{report.revenue.toFixed(2)} {report.baseCurrency}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="text-sm text-muted-foreground">Себестоимость</div>
            <div className="text-xl font-semibold">{report.costOfGoods.toFixed(2)} {report.baseCurrency}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="text-sm text-muted-foreground">Валовая прибыль</div>
            <div
              className={`text-xl font-semibold ${report.grossMargin < 0 ? "text-destructive" : ""}`}
            >
              {report.grossMargin.toFixed(2)} {report.baseCurrency}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

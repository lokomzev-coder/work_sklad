import { notFound } from "next/navigation";
import { getOrgContext } from "@/lib/tenant";
import { can } from "@/lib/permissions";
import { getPnlReport } from "@/lib/reports";
import { Card, CardContent } from "@/components/ui/card";
import { ReportsSubnav } from "@/components/reports/reports-subnav";
import { PeriodFilter } from "@/components/reports/period-filter";
import { formatMoney } from "@/lib/format";

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
  if (!can(ctx, "reports", "view")) notFound();

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
        <Card>
          <CardContent className="pt-6">
            <div className="text-sm text-muted-foreground">Выручка</div>
            <div className="text-xl font-semibold">{formatMoney(report.revenue, report.baseCurrency)}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="text-sm text-muted-foreground">Себестоимость</div>
            <div className="text-xl font-semibold">{formatMoney(report.costOfGoods, report.baseCurrency)}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="text-sm text-muted-foreground">Валовая прибыль</div>
            <div
              className={`text-xl font-semibold ${report.grossMargin < 0 ? "text-destructive" : ""}`}
            >
              {formatMoney(report.grossMargin, report.baseCurrency)}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

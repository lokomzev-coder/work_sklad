import { notFound } from "next/navigation";
import { getOrgContext } from "@/lib/tenant";
import { can } from "@/lib/permissions";
import { getOverviewReport } from "@/lib/reports";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ReportsSubnav } from "@/components/reports/reports-subnav";
import { PeriodFilter } from "@/components/reports/period-filter";
import { KpiCard } from "@/components/dashboard/kpi-card";
import { RankedBarList } from "@/components/dashboard/ranked-bar-list";
import { AreaTrendChart } from "@/components/charts/area-trend-chart";
import { StatusDonutChart } from "@/components/charts/status-donut-chart";
import { StockActivityChart } from "@/components/charts/stock-activity-chart";
import { Package, ShoppingCart, Truck, Wallet } from "lucide-react";
import { formatCompactNumber, formatMoney, type ValueFormat } from "@/lib/format";
import { getCurrencyIcon } from "@/lib/currency-icons";

export default async function ReportsOverviewPage({
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

  const report = await getOverviewReport(ctx.orgId, {
    from: from ? new Date(from) : undefined,
    to: to ? new Date(`${to}T23:59:59`) : undefined,
  });
  const { kpis } = report;
  const money = (amount: number) => formatMoney(amount, report.baseCurrency);
  const moneyFormat: ValueFormat = { kind: "money", currency: report.baseCurrency };
  const compactFormat: ValueFormat = { kind: "compact" };
  const CurrencyIcon = getCurrencyIcon(report.baseCurrency);

  return (
    <div className="flex flex-col gap-4">
      <ReportsSubnav org={org} active="overview" />
      <h1 className="text-2xl font-semibold">Обзор</h1>
      <PeriodFilter from={from} to={to} />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-5">
        <KpiCard label="Выручка" value={money(kpis.revenue)} changePct={kpis.revenueChangePct} icon={CurrencyIcon} />
        <KpiCard
          label="Заказы"
          value={formatCompactNumber(kpis.ordersCount)}
          changePct={kpis.ordersChangePct}
          icon={ShoppingCart}
        />
        <KpiCard label="Средний чек" value={money(kpis.avgOrderValue)} icon={Wallet} />
        <KpiCard
          label="Остаток денег"
          value={money(kpis.cashBalance)}
          icon={CurrencyIcon}
          href={`/${org}/reports/money`}
        />
        <KpiCard
          label="Открытые заказы поставщику"
          value={formatCompactNumber(kpis.activePurchaseOrders)}
          icon={Truck}
          href={`/${org}/purchase-orders`}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Выручка по дням</CardTitle>
          </CardHeader>
          <CardContent>
            <AreaTrendChart
              data={report.daily}
              series={[{ key: "revenue", label: "Выручка", color: "var(--chart-1)" }]}
              format={compactFormat}
              className="h-64 w-full"
            />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Движение денег</CardTitle>
          </CardHeader>
          <CardContent>
            <AreaTrendChart
              data={report.daily}
              series={[
                { key: "cashIn", label: "Приход", color: "var(--chart-1)" },
                { key: "cashOut", label: "Расход", color: "var(--chart-4)" },
              ]}
              format={compactFormat}
              className="h-64 w-full"
            />
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Заказы по статусам</CardTitle>
          </CardHeader>
          <CardContent>
            <StatusDonutChart data={report.orderStatusBreakdown} className="h-64 w-full" />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Package className="size-4" /> Складская активность за период
            </CardTitle>
          </CardHeader>
          <CardContent>
            <StockActivityChart data={report.stockActivity} className="h-64 w-full" />
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Топ клиентов по выручке</CardTitle>
          </CardHeader>
          <CardContent>
            <RankedBarList
              rows={report.topClients.map((c) => ({ name: c.name, value: c.revenue }))}
              format={moneyFormat}
              emptyLabel="Пока нет заказов с клиентами"
            />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Топ товаров по отгрузке</CardTitle>
          </CardHeader>
          <CardContent>
            <RankedBarList
              rows={report.topItems.map((i) => ({ name: i.name, value: i.qty }))}
              format={compactFormat}
              emptyLabel="Пока нет складских отгрузок"
            />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

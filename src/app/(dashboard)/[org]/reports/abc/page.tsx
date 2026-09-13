import { notFound } from "next/navigation";
import Link from "next/link";
import { getOrgContext } from "@/lib/tenant";
import { can } from "@/lib/permissions";
import { getAbcByItem, getAbcByClient, type AbcClass } from "@/lib/reports";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { ReportsSubnav } from "@/components/reports/reports-subnav";
import { PeriodFilter } from "@/components/reports/period-filter";
import { formatMoney, formatPercent } from "@/lib/format";
import { statusBadgeClass } from "@/lib/status-color";
import { cn } from "@/lib/utils";

const CLASS_COLOR: Record<AbcClass, string> = { A: "green", B: "orange", C: "red" };
const DIMENSION_TABS = [
  { key: "item", label: "Товары" },
  { key: "client", label: "Клиенты" },
] as const;

export default async function AbcReportPage({
  params,
  searchParams,
}: {
  params: Promise<{ org: string }>;
  searchParams: Promise<{ from?: string; to?: string; dimension?: string }>;
}) {
  const { org } = await params;
  const { from, to, dimension: dimensionRaw } = await searchParams;
  const ctx = await getOrgContext(org);
  if (!can(ctx, "reports", "view")) notFound();

  const range = {
    from: from ? new Date(from) : undefined,
    to: to ? new Date(`${to}T23:59:59`) : undefined,
  };
  const dimension = dimensionRaw === "client" ? "client" : "item";
  const report = dimension === "client" ? await getAbcByClient(ctx.orgId, range) : await getAbcByItem(ctx.orgId, range);

  const qs = new URLSearchParams();
  if (from) qs.set("from", from);
  if (to) qs.set("to", to);

  return (
    <div className="flex flex-col gap-4">
      <ReportsSubnav org={org} active="abc" />
      <div>
        <h1 className="text-2xl font-semibold">ABC-анализ</h1>
        <p className="text-sm text-muted-foreground">
          Классический ABC по накопленной доле выручки за период: класс <b>A</b> — товары/клиенты,
          дающие первые 80% выручки, <b>B</b> — следующие 15% (80-95%), <b>C</b> — оставшиеся 5%.
          Пороги фиксированы, не настраиваются.
        </p>
      </div>
      <PeriodFilter from={from} to={to} />

      <div className="flex flex-wrap gap-2">
        {DIMENSION_TABS.map((tab) => {
          const tabQs = new URLSearchParams(qs);
          tabQs.set("dimension", tab.key);
          return (
            <Link
              key={tab.key}
              href={`/${org}/reports/abc?${tabQs.toString()}`}
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

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{dimension === "client" ? "Клиент" : "Товар"}</TableHead>
              <TableHead className="text-right">Выручка</TableHead>
              <TableHead className="text-right">Доля</TableHead>
              <TableHead className="text-right">Накопленная доля</TableHead>
              <TableHead className="text-right">Класс</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {report.rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="text-center text-muted-foreground">
                  Нет данных за период
                </TableCell>
              </TableRow>
            ) : (
              report.rows.map((row) => (
                <TableRow key={row.key}>
                  <TableCell>{row.label}</TableCell>
                  <TableCell className="text-right">{formatMoney(row.value, report.baseCurrency)}</TableCell>
                  <TableCell className="text-right">{formatPercent(row.sharePct)}</TableCell>
                  <TableCell className="text-right">{formatPercent(row.cumulativePct)}</TableCell>
                  <TableCell className="text-right">
                    <Badge variant="outline" className={statusBadgeClass(CLASS_COLOR[row.cls])}>
                      {row.cls}
                    </Badge>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

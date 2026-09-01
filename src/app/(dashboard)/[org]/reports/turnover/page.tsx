import { notFound } from "next/navigation";
import { getOrgContext } from "@/lib/tenant";
import { can } from "@/lib/permissions";
import { getTurnoverReport } from "@/lib/reports";
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

  const rows = await getTurnoverReport(ctx.orgId, {
    from: from ? new Date(from) : undefined,
    to: to ? new Date(`${to}T23:59:59`) : undefined,
  });

  return (
    <div className="flex flex-col gap-4">
      <ReportsSubnav org={org} active="turnover" />
      <h1 className="text-2xl font-semibold">Обороты</h1>
      <PeriodFilter from={from} to={to} />
      <p className="text-sm text-muted-foreground">
        Перемещения между складами не учитываются — это внутренний перенос, а не изменение
        общего остатка компании.
      </p>

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
    </div>
  );
}

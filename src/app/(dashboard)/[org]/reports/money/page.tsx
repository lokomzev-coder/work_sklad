import { getOrgContext } from "@/lib/tenant";
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

  const report = await getMoneyReport(ctx.orgId, {
    from: from ? new Date(from) : undefined,
    to: to ? new Date(`${to}T23:59:59`) : undefined,
  });

  return (
    <div className="flex flex-col gap-4">
      <ReportsSubnav org={org} active="money" />
      <h1 className="text-2xl font-semibold">Деньги</h1>
      <PeriodFilter from={from} to={to} />

      <div className="grid gap-4 sm:grid-cols-3">
        <Card>
          <CardContent className="pt-6">
            <div className="text-sm text-muted-foreground">Поступления за период</div>
            <div className="text-xl font-semibold">{report.periodIn.toFixed(2)} ₽</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="text-sm text-muted-foreground">Выплаты за период</div>
            <div className="text-xl font-semibold">{report.periodOut.toFixed(2)} ₽</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="text-sm text-muted-foreground">Текущий денежный остаток</div>
            <div className="text-xl font-semibold">{report.currentBalance.toFixed(2)} ₽</div>
          </CardContent>
        </Card>
      </div>

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
                    <Badge variant={r.direction === "IN" ? "default" : "secondary"}>
                      {r.direction === "IN" ? "Поступление" : "Выплата"}
                    </Badge>
                  </TableCell>
                  <TableCell>{r.counterpartyName}</TableCell>
                  <TableCell className="text-right">
                    {r.amount.toFixed(2)} {r.currency}
                  </TableCell>
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

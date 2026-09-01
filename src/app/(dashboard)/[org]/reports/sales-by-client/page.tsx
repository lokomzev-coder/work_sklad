import Link from "next/link";
import { notFound } from "next/navigation";
import { getOrgContext } from "@/lib/tenant";
import { can } from "@/lib/permissions";
import { getSalesByClientReport } from "@/lib/reports";
import { getOrgBaseCurrency } from "@/lib/currency";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "@/components/ui/table";
import { ReportsSubnav } from "@/components/reports/reports-subnav";
import { formatMoney } from "@/lib/format";

export default async function SalesByClientReportPage({
  params,
}: {
  params: Promise<{ org: string }>;
}) {
  const { org } = await params;
  const ctx = await getOrgContext(org);
  if (!can(ctx, "reports", "view")) notFound();

  const [rows, baseCurrency] = await Promise.all([
    getSalesByClientReport(ctx.orgId),
    getOrgBaseCurrency(ctx.orgId),
  ]);

  return (
    <div className="flex flex-col gap-4">
      <ReportsSubnav org={org} active="sales-by-client" />
      <h1 className="text-2xl font-semibold">Продажи по клиентам</h1>

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Клиент</TableHead>
              <TableHead className="text-right">Сумма заказов</TableHead>
              <TableHead className="text-right">Оплачено</TableHead>
              <TableHead className="text-right">Задолженность</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={4} className="text-center text-muted-foreground">
                  Заказов пока нет
                </TableCell>
              </TableRow>
            ) : (
              rows.map((r) => (
                <TableRow key={r.clientId}>
                  <TableCell>
                    <Link href={`/${org}/clients/${r.clientId}`} className="hover:underline">
                      {r.clientName}
                    </Link>
                  </TableCell>
                  <TableCell className="text-right">{formatMoney(r.orderTotal, baseCurrency)}</TableCell>
                  <TableCell className="text-right">{formatMoney(r.paymentsReceived, baseCurrency)}</TableCell>
                  <TableCell className="text-right">
                    <span className={r.receivable > 0 ? "text-destructive" : ""}>
                      {formatMoney(r.receivable, baseCurrency)}
                    </span>
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

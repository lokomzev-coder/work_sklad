import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getOrgContext } from "@/lib/tenant";
import { can } from "@/lib/permissions";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "@/components/ui/table";
import { statusBadgeClass } from "@/lib/status-color";
import { formatMoney } from "@/lib/format";
import { cn } from "@/lib/utils";
import { ArrowDownLeft, ArrowUpRight } from "lucide-react";
import { PaymentsSubnav } from "@/components/payments/payments-subnav";
import { SimpleDeleteButton } from "@/components/data-table/simple-delete-button";
import { deleteCashOrder } from "@/actions/cash-orders";

export default async function CashOrdersPage({
  params,
}: {
  params: Promise<{ org: string }>;
}) {
  const { org } = await params;
  const ctx = await getOrgContext(org);
  if (!can(ctx, "payments", "view")) notFound();
  const canCreate = can(ctx, "payments", "create");
  const canDelete = can(ctx, "payments", "delete");

  const cashOrders = await prisma.cashOrder.findMany({
    where: { orgId: ctx.orgId },
    orderBy: { createdAt: "desc" },
    include: { counterparty: true, expenseItem: true },
    take: 200,
  });

  return (
    <div className="flex flex-col gap-4">
      <PaymentsSubnav org={org} active="cash-orders" />
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Кассовые ордера</h1>
          <p className="text-sm text-muted-foreground">
            Движения наличных вне розничной смены (взнос учредителя, хоз. расходы) — не требуют
            контрагента, в отличие от обычного платежа.
          </p>
        </div>
        {canCreate && (
          <Button render={<Link href={`/${org}/payments/cash-orders/new`} />}>Новый ордер</Button>
        )}
      </div>

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Дата</TableHead>
              <TableHead>Направление</TableHead>
              <TableHead>Контрагент</TableHead>
              <TableHead>Статья расходов</TableHead>
              <TableHead className="text-right">Сумма</TableHead>
              <TableHead>Комментарий</TableHead>
              {canDelete && <TableHead className="w-0" />}
            </TableRow>
          </TableHeader>
          <TableBody>
            {cashOrders.length === 0 ? (
              <TableRow>
                <TableCell colSpan={canDelete ? 7 : 6} className="text-center text-muted-foreground">
                  Кассовых ордеров пока нет
                </TableCell>
              </TableRow>
            ) : (
              cashOrders.map((o) => (
                <TableRow key={o.id}>
                  <TableCell>{o.createdAt.toLocaleDateString("ru-RU")}</TableCell>
                  <TableCell>
                    <Badge
                      variant="outline"
                      className={cn("gap-1", statusBadgeClass(o.direction === "IN" ? "green" : "orange"))}
                    >
                      {o.direction === "IN" ? (
                        <ArrowDownLeft className="size-3" />
                      ) : (
                        <ArrowUpRight className="size-3" />
                      )}
                      {o.direction === "IN" ? "Приход" : "Расход"}
                    </Badge>
                  </TableCell>
                  <TableCell>{o.counterparty?.name ?? "—"}</TableCell>
                  <TableCell>{o.expenseItem?.name ?? "—"}</TableCell>
                  <TableCell className="text-right">{formatMoney(Number(o.amount), o.currency)}</TableCell>
                  <TableCell className="text-muted-foreground">{o.comment ?? "—"}</TableCell>
                  {canDelete && (
                    <TableCell className="text-right">
                      <SimpleDeleteButton onDelete={deleteCashOrder.bind(null, org, o.id)} title="Удалить кассовый ордер?" />
                    </TableCell>
                  )}
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

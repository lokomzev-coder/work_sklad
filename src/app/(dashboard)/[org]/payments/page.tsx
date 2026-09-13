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

export default async function PaymentsPage({
  params,
}: {
  params: Promise<{ org: string }>;
}) {
  const { org } = await params;
  const ctx = await getOrgContext(org);
  if (!can(ctx, "payments", "view")) notFound();
  const canCreate = can(ctx, "payments", "create");

  const payments = await prisma.payment.findMany({
    where: { orgId: ctx.orgId },
    orderBy: { createdAt: "desc" },
    include: { counterparty: true },
    take: 200,
  });

  return (
    <div className="flex flex-col gap-4">
      <PaymentsSubnav org={org} active="payments" />
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Платежи</h1>
        {canCreate && (
          <Button render={<Link href={`/${org}/payments/new`} />}>Записать платёж</Button>
        )}
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
            {payments.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="text-center text-muted-foreground">
                  Платежей пока нет
                </TableCell>
              </TableRow>
            ) : (
              payments.map((p) => (
                <TableRow key={p.id}>
                  <TableCell>{p.createdAt.toLocaleDateString("ru-RU")}</TableCell>
                  <TableCell>
                    <Badge
                      variant="outline"
                      className={cn("gap-1", statusBadgeClass(p.direction === "IN" ? "green" : "orange"))}
                    >
                      {p.direction === "IN" ? (
                        <ArrowDownLeft className="size-3" />
                      ) : (
                        <ArrowUpRight className="size-3" />
                      )}
                      {p.direction === "IN" ? "Поступление" : "Выплата"}
                    </Badge>
                  </TableCell>
                  <TableCell>{p.counterparty.name}</TableCell>
                  <TableCell className="text-right">
                    {formatMoney(Number(p.amount), p.currency)}
                  </TableCell>
                  <TableCell className="text-muted-foreground">{p.comment ?? "—"}</TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getOrgContext } from "@/lib/tenant";
import { can } from "@/lib/permissions";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { statusBadgeClass } from "@/lib/status-color";
import { formatMoney } from "@/lib/format";

export default async function InvoicesOutPage({
  params,
}: {
  params: Promise<{ org: string }>;
}) {
  const { org } = await params;
  const ctx = await getOrgContext(org);
  if (!can(ctx, "invoicesOut", "view")) notFound();

  const invoicesOut = await prisma.invoiceOut.findMany({
    where: { orgId: ctx.orgId },
    orderBy: { number: "desc" },
    include: { client: true, lineItems: true, status: true },
  });

  const canCreate = can(ctx, "invoicesOut", "create");

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Счета покупателям</h1>
        {canCreate && (
          <Button render={<Link href={`/${org}/invoices-out/new`} />}>Новый счёт</Button>
        )}
      </div>

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>№</TableHead>
              <TableHead>Клиент</TableHead>
              <TableHead>Статус</TableHead>
              <TableHead className="text-right">Сумма</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {invoicesOut.length === 0 ? (
              <TableRow>
                <TableCell colSpan={4} className="text-center text-muted-foreground">
                  Счетов пока нет
                </TableCell>
              </TableRow>
            ) : (
              invoicesOut.map((invoice) => {
                const total = invoice.lineItems.reduce(
                  (sum, li) => sum + Number(li.unitPriceSnapshot) * Number(li.quantity),
                  0,
                );
                const currency = invoice.lineItems[0]?.currency ?? "RUB";
                return (
                  <TableRow key={invoice.id}>
                    <TableCell>
                      <Link href={`/${org}/invoices-out/${invoice.id}`} className="font-medium hover:underline">
                        №{invoice.number}
                      </Link>
                    </TableCell>
                    <TableCell>{invoice.client?.name ?? "—"}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className={statusBadgeClass(invoice.status.color)}>
                        {invoice.status.name}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">{formatMoney(total, currency)}</TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

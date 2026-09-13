import { notFound } from "next/navigation";
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { getOrgContext } from "@/lib/tenant";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatMoney } from "@/lib/format";

export default async function KassaSalePage({
  params,
}: {
  params: Promise<{ org: string; id: string }>;
}) {
  const { org, id } = await params;
  const ctx = await getOrgContext(org);

  const sale = await prisma.retailSale.findFirst({
    where: { id, orgId: ctx.orgId },
    include: {
      client: true,
      lineItems: { include: { catalogItem: true } },
      payment: true,
      fiscalReceipt: true,
    },
  });
  if (!sale) notFound();

  const total = sale.lineItems.reduce((sum, li) => sum + Number(li.unitPriceSnapshot) * Number(li.quantity), 0);
  const currency = sale.lineItems[0]?.currency ?? "RUB";

  return (
    <Card className="mx-auto max-w-lg">
      <CardHeader>
        <CardTitle>Продажа №{sale.number}</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <p className="text-sm text-muted-foreground">
          {sale.client.isWalkIn ? "Розничный покупатель" : sale.client.name}
        </p>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Товар</TableHead>
              <TableHead>Кол-во</TableHead>
              <TableHead>Сумма</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {sale.lineItems.map((li) => (
              <TableRow key={li.id}>
                <TableCell>{li.catalogItem.name}</TableCell>
                <TableCell>{li.quantity.toString()}</TableCell>
                <TableCell>{formatMoney(Number(li.unitPriceSnapshot) * Number(li.quantity), li.currency)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        <div className="flex items-center justify-between text-lg font-semibold">
          <span>Итого</span>
          <span>{formatMoney(total, currency)}</span>
        </div>
        <p className="text-sm text-muted-foreground">
          Оплата: {sale.payment?.method === "CARD" ? "Картой" : "Наличными"}
        </p>
        {sale.fiscalReceipt && (
          <p className="text-sm text-muted-foreground">
            Фискальный чек:{" "}
            {sale.fiscalReceipt.status === "REGISTERED"
              ? "зарегистрирован"
              : sale.fiscalReceipt.status === "FAILED"
                ? "ошибка регистрации"
                : "в обработке"}
          </p>
        )}
        <div className="flex gap-2">
          <Button type="button" render={<a href={`/print/sales/${org}/${sale.id}`} target="_blank" rel="noopener" />}>
            Печать
          </Button>
          <Button type="button" variant="outline" render={<Link href={`/${org}/kassa`} />}>
            Новая продажа
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

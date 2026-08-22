import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getOrgContext } from "@/lib/tenant";
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

const TYPE_LABEL: Record<string, string> = {
  ENTER: "Оприходование",
  LOSS: "Списание",
  MOVE: "Перемещение",
  INVENTORY: "Инвентаризация",
  DEMAND: "Отгрузка",
  SUPPLY: "Приёмка",
  SALES_RETURN: "Возврат от клиента",
  PURCHASE_RETURN: "Возврат поставщику",
};

export default async function MovementDetailPage({
  params,
}: {
  params: Promise<{ org: string; id: string }>;
}) {
  const { org, id } = await params;
  const ctx = await getOrgContext(org);

  const movement = await prisma.stockMovement.findFirst({
    where: { id, orgId: ctx.orgId },
    include: {
      store: true,
      toStore: true,
      order: true,
      purchaseOrder: true,
      lines: { include: { catalogItem: true } },
    },
  });

  if (!movement) {
    notFound();
  }

  return (
    <div className="flex max-w-2xl flex-col gap-4">
      <div className="flex items-center gap-3">
        <h1 className="text-2xl font-semibold">
          {TYPE_LABEL[movement.type]} №{movement.number}
        </h1>
        <Badge variant="secondary">
          {movement.createdAt.toLocaleDateString("ru-RU")}
        </Badge>
      </div>

      <Card>
        <CardContent className="flex flex-col gap-2 text-sm">
          <div>
            <span className="text-muted-foreground">Склад: </span>
            {movement.type === "MOVE"
              ? `${movement.store.name} → ${movement.toStore?.name ?? "—"}`
              : movement.store.name}
          </div>
          {movement.order && (
            <div>
              <span className="text-muted-foreground">Заказ: </span>
              <Link href={`/${org}/orders/${movement.order.id}`} className="underline">
                №{movement.order.number}
              </Link>
            </div>
          )}
          {movement.purchaseOrder && (
            <div>
              <span className="text-muted-foreground">Заказ поставщику: </span>
              <Link
                href={`/${org}/purchase-orders/${movement.purchaseOrder.id}`}
                className="underline"
              >
                №{movement.purchaseOrder.number}
              </Link>
            </div>
          )}
          {movement.comment && (
            <div>
              <span className="text-muted-foreground">Комментарий: </span>
              {movement.comment}
            </div>
          )}
        </CardContent>
      </Card>

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Товар</TableHead>
              {movement.type === "INVENTORY" ? (
                <>
                  <TableHead className="text-right">Числилось</TableHead>
                  <TableHead className="text-right">Факт</TableHead>
                  <TableHead className="text-right">Корректировка</TableHead>
                </>
              ) : (
                <TableHead className="text-right">Количество</TableHead>
              )}
            </TableRow>
          </TableHeader>
          <TableBody>
            {movement.lines.map((line) => (
              <TableRow key={line.id}>
                <TableCell>{line.catalogItem.name}</TableCell>
                {movement.type === "INVENTORY" ? (
                  <>
                    <TableCell className="text-right">
                      {line.countedQuantity !== null
                        ? (
                            Number(line.countedQuantity) - Number(line.quantity)
                          ).toString()
                        : "—"}
                    </TableCell>
                    <TableCell className="text-right">
                      {line.countedQuantity?.toString() ?? "—"}
                    </TableCell>
                    <TableCell className="text-right">
                      {Number(line.quantity) > 0 ? "+" : ""}
                      {line.quantity.toString()}
                    </TableCell>
                  </>
                ) : (
                  <TableCell className="text-right">{line.quantity.toString()}</TableCell>
                )}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

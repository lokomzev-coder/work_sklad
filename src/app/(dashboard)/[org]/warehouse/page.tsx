import Link from "next/link";
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { WarehouseSubnav } from "@/components/warehouse/warehouse-subnav";

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

export default async function WarehouseMovementsPage({
  params,
}: {
  params: Promise<{ org: string }>;
}) {
  const { org } = await params;
  const ctx = await getOrgContext(org);
  const canEdit = can(ctx.role, "warehouse", "edit");

  const movements = await prisma.stockMovement.findMany({
    where: { orgId: ctx.orgId },
    orderBy: { createdAt: "desc" },
    include: { store: true, toStore: true, _count: { select: { lines: true } } },
    take: 100,
  });

  return (
    <div className="flex flex-col gap-4">
      <WarehouseSubnav org={org} active="movements" />
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Складские движения</h1>
        {canEdit && (
          <DropdownMenu>
            <DropdownMenuTrigger render={<Button>Новое движение</Button>} />
            <DropdownMenuContent align="end">
              <DropdownMenuItem render={<Link href={`/${org}/warehouse/new/enter`} />}>
                Оприходование
              </DropdownMenuItem>
              <DropdownMenuItem render={<Link href={`/${org}/warehouse/new/loss`} />}>
                Списание
              </DropdownMenuItem>
              <DropdownMenuItem render={<Link href={`/${org}/warehouse/new/move`} />}>
                Перемещение
              </DropdownMenuItem>
              <DropdownMenuItem render={<Link href={`/${org}/warehouse/new/inventory`} />}>
                Инвентаризация
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>№</TableHead>
              <TableHead>Тип</TableHead>
              <TableHead>Склад</TableHead>
              <TableHead>Позиций</TableHead>
              <TableHead>Дата</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {movements.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="text-center text-muted-foreground">
                  Движений пока нет
                </TableCell>
              </TableRow>
            ) : (
              movements.map((m) => (
                <TableRow key={m.id}>
                  <TableCell>
                    <Link href={`/${org}/warehouse/${m.id}`} className="block">
                      №{m.number}
                    </Link>
                  </TableCell>
                  <TableCell>
                    <Badge variant="secondary">{TYPE_LABEL[m.type]}</Badge>
                  </TableCell>
                  <TableCell>
                    {m.type === "MOVE"
                      ? `${m.store.name} → ${m.toStore?.name ?? "—"}`
                      : m.store.name}
                  </TableCell>
                  <TableCell>{m._count.lines}</TableCell>
                  <TableCell>{m.createdAt.toLocaleDateString("ru-RU")}</TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

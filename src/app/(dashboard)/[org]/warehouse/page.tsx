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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { WarehouseSubnav } from "@/components/warehouse/warehouse-subnav";
import { MovementFilters } from "@/components/warehouse/movement-filters";
import type { StockMovementType } from "@/generated/prisma/enums";

const TYPE_LABEL: Record<string, string> = {
  ENTER: "Оприходование",
  LOSS: "Списание",
  MOVE: "Перемещение",
  INVENTORY: "Инвентаризация",
  DEMAND: "Отгрузка",
  SUPPLY: "Приёмка",
  SALES_RETURN: "Возврат от клиента",
  PURCHASE_RETURN: "Возврат поставщику",
  RETAIL_SALE: "Розничная продажа",
  RETAIL_RETURN: "Розничный возврат",
};

export default async function WarehouseMovementsPage({
  params,
  searchParams,
}: {
  params: Promise<{ org: string }>;
  searchParams: Promise<{ type?: string; storeId?: string; from?: string; to?: string }>;
}) {
  const { org } = await params;
  const { type, storeId, from, to } = await searchParams;
  const ctx = await getOrgContext(org);
  if (!can(ctx, "warehouse", "view")) notFound();
  const canCreate = can(ctx, "warehouse", "create");

  const isValidType = type && type in TYPE_LABEL;

  const [movements, stores] = await Promise.all([
    prisma.stockMovement.findMany({
      where: {
        orgId: ctx.orgId,
        ...(isValidType ? { type: type as StockMovementType } : {}),
        ...(storeId ? { OR: [{ storeId }, { toStoreId: storeId }] } : {}),
        ...(from || to
          ? {
              createdAt: {
                ...(from ? { gte: new Date(from) } : {}),
                ...(to ? { lte: new Date(`${to}T23:59:59.999`) } : {}),
              },
            }
          : {}),
      },
      orderBy: { createdAt: "desc" },
      include: { store: true, toStore: true, _count: { select: { lines: true } } },
      take: 100,
    }),
    prisma.store.findMany({ where: { orgId: ctx.orgId, status: "ACTIVE" }, orderBy: { name: "asc" } }),
  ]);

  const typeOptions = Object.entries(TYPE_LABEL).map(([value, label]) => ({ value, label }));
  const storeOptions = stores.map((s) => ({ value: s.id, label: s.name }));

  return (
    <div className="flex flex-col gap-4">
      <WarehouseSubnav org={org} active="movements" />
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Складские движения</h1>
        {canCreate && (
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

      <MovementFilters
        type={type}
        storeId={storeId}
        from={from}
        to={to}
        typeOptions={typeOptions}
        storeOptions={storeOptions}
      />

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
                    {!m.isPosted && (
                      <Badge variant="secondary" className="ml-1">
                        Черновик
                      </Badge>
                    )}
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

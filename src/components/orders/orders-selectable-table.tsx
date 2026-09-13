"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
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
import { createPickingWave } from "@/actions/picking-waves";

export interface OrderRow {
  id: string;
  number: number;
  clientName: string;
  statusName: string;
  statusColor: string;
  total: number;
  currency: string;
}

interface OrdersSelectableTableProps {
  orgSlug: string;
  orders: OrderRow[];
  /** "Волна отбора" is gated on the same "warehouse"/"create" permission as
   * every other stock-side "Создать документ" action — the checkbox column
   * itself is just not worth rendering for someone who could never use it. */
  canCreateWave: boolean;
}

/** Client wrapper for the Orders list table — adds a selection checkbox
 * column and a "Создать волну отбора" bar when `canCreateWave`, otherwise
 * renders identically to a plain server-rendered table. The row markup
 * itself (links, badge, sum) is unchanged from the previous server-only
 * version, just parameterized. */
export function OrdersSelectableTable({ orgSlug, orders, canCreateWave }: OrdersSelectableTableProps) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [isPending, startTransition] = useTransition();

  function toggle(id: string, checked: boolean) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });
  }

  function handleCreateWave() {
    startTransition(async () => {
      try {
        const result = await createPickingWave(orgSlug, [...selected]);
        if (result?.error) {
          toast.error(result.error);
        }
      } catch (err) {
        if (
          typeof err === "object" &&
          err !== null &&
          "digest" in err &&
          typeof (err as { digest?: unknown }).digest === "string" &&
          (err as { digest: string }).digest.startsWith("NEXT_REDIRECT")
        ) {
          throw err;
        }
        toast.error(err instanceof Error ? err.message : "Не удалось создать волну отбора");
      }
    });
  }

  return (
    <div className="flex flex-col gap-3">
      {canCreateWave && selected.size > 0 && (
        <div className="flex items-center justify-between rounded-md border bg-secondary/50 px-4 py-2">
          <span className="text-sm">Выбрано: {selected.size}</span>
          <Button type="button" size="sm" onClick={handleCreateWave} disabled={isPending}>
            {isPending ? "Создаём..." : "Создать волну отбора"}
          </Button>
        </div>
      )}
      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              {canCreateWave && <TableHead className="w-10" />}
              <TableHead>№</TableHead>
              <TableHead>Клиент</TableHead>
              <TableHead>Статус</TableHead>
              <TableHead className="text-right">Сумма</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {orders.length === 0 ? (
              <TableRow>
                <TableCell colSpan={canCreateWave ? 5 : 4} className="text-center text-muted-foreground">
                  Заказов пока нет
                </TableCell>
              </TableRow>
            ) : (
              orders.map((order) => {
                const href = `/${orgSlug}/orders/${order.id}`;
                return (
                  <TableRow key={order.id}>
                    {canCreateWave && (
                      <TableCell>
                        <Checkbox
                          checked={selected.has(order.id)}
                          onCheckedChange={(checked) => toggle(order.id, checked === true)}
                        />
                      </TableCell>
                    )}
                    <TableCell>
                      <Link href={href} className="block font-medium hover:underline">
                        №{order.number}
                      </Link>
                    </TableCell>
                    <TableCell>
                      <Link href={href} className="block">
                        {order.clientName}
                      </Link>
                    </TableCell>
                    <TableCell>
                      <Link href={href} className="block">
                        <Badge variant="outline" className={statusBadgeClass(order.statusColor)}>
                          {order.statusName}
                        </Badge>
                      </Link>
                    </TableCell>
                    <TableCell className="text-right">
                      <Link href={href} className="block">
                        {formatMoney(order.total, order.currency)}
                      </Link>
                    </TableCell>
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

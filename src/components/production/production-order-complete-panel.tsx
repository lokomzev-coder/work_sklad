"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "@/components/ui/table";
import { completeProductionOrder } from "@/actions/production-orders";

interface ComponentRow {
  catalogItemId: string;
  name: string;
  /** Needed per one unit of output, so the panel can rescale live as the
   * user edits the partial quantity input. */
  neededPerUnit: number;
  available: number;
}

interface ProductionOrderCompletePanelProps {
  orgSlug: string;
  productionOrderId: string;
  outputName: string;
  totalQuantity: number;
  completedQuantity: number;
  components: ComponentRow[];
  completedAt: string | null;
}

export function ProductionOrderCompletePanel({
  orgSlug,
  productionOrderId,
  outputName,
  totalQuantity,
  completedQuantity,
  components,
  completedAt,
}: ProductionOrderCompletePanelProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const remaining = totalQuantity - completedQuantity;
  // Defaults to the current remainder, re-deriving on every prop change
  // (i.e. after a successful completion refreshes completedQuantity) unless
  // the user has actively typed something — cleared back to null on success
  // so the next partial's default reflects the new remainder, not a stale
  // value left over from before this call.
  const [amountOverride, setAmountOverride] = useState<string | null>(null);
  const amount = amountOverride ?? String(remaining);

  const parsedAmount = Number(amount);
  const amountValid = Number.isFinite(parsedAmount) && parsedAmount > 0 && parsedAmount <= remaining;

  function handleComplete() {
    if (!amountValid) return;
    startTransition(async () => {
      const result = await completeProductionOrder(orgSlug, productionOrderId, parsedAmount);
      if (result.error) {
        toast.error(result.error);
        return;
      }
      for (const warning of result.warnings ?? []) {
        toast.warning(warning);
      }
      toast.success("Производство выполнено");
      setAmountOverride(null);
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-3 rounded-md border p-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-medium">Материалы</h2>
        <span className="text-sm text-muted-foreground">
          Выполнено {completedQuantity} из {totalQuantity}
        </span>
      </div>
      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Материал</TableHead>
              <TableHead className="text-right">Нужно</TableHead>
              <TableHead className="text-right">Есть на складе</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {components.map((c) => {
              const needed = amountValid ? c.neededPerUnit * parsedAmount : 0;
              return (
                <TableRow key={c.catalogItemId}>
                  <TableCell>{c.name}</TableCell>
                  <TableCell className="text-right">{needed}</TableCell>
                  <TableCell className={c.available < needed ? "text-right text-destructive" : "text-right"}>
                    {c.available}
                  </TableCell>
                </TableRow>
              );
            })}
            <TableRow>
              <TableCell className="font-medium">Выпуск: {outputName}</TableCell>
              <TableCell className="text-right font-medium">{amountValid ? parsedAmount : 0}</TableCell>
              <TableCell />
            </TableRow>
          </TableBody>
        </Table>
      </div>
      {completedAt ? (
        <p className="text-sm text-muted-foreground">
          Выполнено {new Date(completedAt).toLocaleDateString("ru-RU")}
        </p>
      ) : remaining <= 0 ? (
        <p className="text-sm text-muted-foreground">Выполнено</p>
      ) : (
        <div className="flex items-end gap-2">
          <div className="flex flex-col gap-2">
            <Label>Количество к выполнению</Label>
            <Input
              type="number"
              min="0"
              max={remaining}
              step="0.001"
              value={amount}
              onChange={(e) => setAmountOverride(e.target.value)}
              className="w-40"
            />
          </div>
          <Button onClick={handleComplete} disabled={isPending || !amountValid}>
            Выполнить {amountValid ? parsedAmount : ""}
          </Button>
        </div>
      )}
    </div>
  );
}

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
import { Badge } from "@/components/ui/badge";
import { completeProductionStage } from "@/actions/production-orders";

interface MaterialRow {
  catalogItemId: string;
  name: string;
  neededPerUnit: number;
  available: number;
}

interface StageRow {
  id: string;
  stageName: string;
  position: number;
  totalQuantity: number;
  completedQuantity: number;
  availableQuantity: number;
  blockedQuantity: number;
  isLast: boolean;
  materials: MaterialRow[];
}

interface ProductionStagesPanelProps {
  orgSlug: string;
  outputName: string;
  stages: StageRow[];
  orderCompletedAt: string | null;
}

function StageRowPanel({
  orgSlug,
  stage,
  outputName,
}: {
  orgSlug: string;
  stage: StageRow;
  outputName: string;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [amountOverride, setAmountOverride] = useState<string | null>(null);
  const amount = amountOverride ?? String(stage.availableQuantity);

  const parsedAmount = Number(amount);
  const amountValid = Number.isFinite(parsedAmount) && parsedAmount > 0 && parsedAmount <= stage.availableQuantity;
  const isDone = stage.completedQuantity >= stage.totalQuantity;

  function handleComplete() {
    if (!amountValid) return;
    startTransition(async () => {
      const result = await completeProductionStage(orgSlug, stage.id, parsedAmount);
      if (result.error) {
        toast.error(result.error);
        return;
      }
      for (const warning of result.warnings ?? []) {
        toast.warning(warning);
      }
      toast.success(`Этап «${stage.stageName}» выполнен`);
      setAmountOverride(null);
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-3 rounded-md border p-4">
      <div className="flex items-center justify-between">
        <h3 className="font-medium">
          Этап {stage.position + 1}: {stage.stageName}
          {stage.isLast && (
            <Badge variant="outline" className="ml-2">
              Финальный
            </Badge>
          )}
        </h3>
        <span className="text-sm text-muted-foreground">
          Выполнено {stage.completedQuantity} из {stage.totalQuantity}
          {stage.blockedQuantity > 0 && ` · заблокировано ${stage.blockedQuantity}`}
        </span>
      </div>

      {stage.materials.length > 0 && (
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
              {stage.materials.map((m) => {
                const needed = amountValid ? m.neededPerUnit * parsedAmount : 0;
                return (
                  <TableRow key={m.catalogItemId}>
                    <TableCell>{m.name}</TableCell>
                    <TableCell className="text-right">{needed}</TableCell>
                    <TableCell className={m.available < needed ? "text-right text-destructive" : "text-right"}>
                      {m.available}
                    </TableCell>
                  </TableRow>
                );
              })}
              {stage.isLast && (
                <TableRow>
                  <TableCell className="font-medium">Выпуск: {outputName}</TableCell>
                  <TableCell className="text-right font-medium">{amountValid ? parsedAmount : 0}</TableCell>
                  <TableCell />
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      )}

      {isDone ? (
        <p className="text-sm text-muted-foreground">Этап выполнен</p>
      ) : stage.availableQuantity <= 0 ? (
        <p className="text-sm text-muted-foreground">
          Ждёт завершения предыдущего этапа ({stage.blockedQuantity})
        </p>
      ) : (
        <div className="flex items-end gap-2">
          <div className="flex flex-col gap-2">
            <Label>Количество к выполнению</Label>
            <Input
              type="number"
              min="0"
              max={stage.availableQuantity}
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

export function ProductionStagesPanel({ orgSlug, outputName, stages, orderCompletedAt }: ProductionStagesPanelProps) {
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-medium">Этапы</h2>
        {orderCompletedAt && (
          <span className="text-sm text-muted-foreground">
            Выполнено {new Date(orderCompletedAt).toLocaleDateString("ru-RU")}
          </span>
        )}
      </div>
      {stages
        .sort((a, b) => a.position - b.position)
        .map((stage) => (
          <StageRowPanel key={stage.id} orgSlug={orgSlug} stage={stage} outputName={outputName} />
        ))}
    </div>
  );
}

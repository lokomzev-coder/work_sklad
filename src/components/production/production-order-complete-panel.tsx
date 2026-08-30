"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "@/components/ui/table";
import { completeProductionOrder } from "@/actions/production-orders";

interface MaterialRow {
  catalogItemId: string;
  name: string;
  needed: number;
  available: number;
}

interface ProductionOrderCompletePanelProps {
  orgSlug: string;
  productionOrderId: string;
  outputName: string;
  outputQuantity: number;
  materials: MaterialRow[];
  completedAt: string | null;
}

export function ProductionOrderCompletePanel({
  orgSlug,
  productionOrderId,
  outputName,
  outputQuantity,
  materials,
  completedAt,
}: ProductionOrderCompletePanelProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  function handleComplete() {
    startTransition(async () => {
      const result = await completeProductionOrder(orgSlug, productionOrderId);
      if (result.error) {
        toast.error(result.error);
        return;
      }
      toast.success("Производство выполнено");
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-3 rounded-md border p-4">
      <h2 className="text-lg font-medium">Материалы</h2>
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
            {materials.map((m) => (
              <TableRow key={m.catalogItemId}>
                <TableCell>{m.name}</TableCell>
                <TableCell className="text-right">{m.needed}</TableCell>
                <TableCell className={m.available < m.needed ? "text-right text-destructive" : "text-right"}>
                  {m.available}
                </TableCell>
              </TableRow>
            ))}
            <TableRow>
              <TableCell className="font-medium">Выпуск: {outputName}</TableCell>
              <TableCell className="text-right font-medium">{outputQuantity}</TableCell>
              <TableCell />
            </TableRow>
          </TableBody>
        </Table>
      </div>
      {completedAt ? (
        <p className="text-sm text-muted-foreground">
          Выполнено {new Date(completedAt).toLocaleDateString("ru-RU")}
        </p>
      ) : (
        <Button onClick={handleComplete} disabled={isPending} className="self-start">
          Выполнить производство
        </Button>
      )}
    </div>
  );
}

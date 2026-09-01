"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "@/components/ui/table";
import { EntityCombobox, type ComboboxOption } from "@/components/forms/entity-combobox";
import {
  createDemand,
  createSupply,
  createSalesReturn,
  createPurchaseReturn,
} from "@/actions/fulfillment";

export interface FulfillmentLine {
  catalogItemId: string;
  name: string;
  ordered: number;
  fulfilled: number;
}

export interface FulfillmentHistoryEntry {
  id: string;
  number: number;
  createdAt: string;
  storeName: string;
}

type FulfillmentKind = "demand" | "supply" | "salesReturn" | "purchaseReturn";

interface FulfillmentPanelProps {
  orgSlug: string;
  kind: FulfillmentKind;
  parentId: string;
  storeOptions: ComboboxOption[];
  /** Block I2.2: pre-fills the store picker with the acting employee's
   * default store, if they have one — just a convenience, still changeable. */
  defaultStoreId?: string | null;
  lines: FulfillmentLine[];
  history: FulfillmentHistoryEntry[];
}

const ACTIONS: Record<FulfillmentKind, typeof createDemand> = {
  demand: createDemand,
  supply: createSupply,
  salesReturn: createSalesReturn,
  purchaseReturn: createPurchaseReturn,
};

const LABELS: Record<
  FulfillmentKind,
  {
    title: string;
    action: string;
    submitting: string;
    successToast: string;
    remainingLabel: string;
    emptyMessage: string;
  }
> = {
  demand: {
    title: "Отгрузка",
    action: "Отгрузить",
    submitting: "Отгружаем...",
    successToast: "Отгрузка проведена",
    remainingLabel: "Осталось отгрузить",
    emptyMessage: "Всё отгружено",
  },
  supply: {
    title: "Приёмка",
    action: "Принять",
    submitting: "Принимаем...",
    successToast: "Приёмка проведена",
    remainingLabel: "Осталось принять",
    emptyMessage: "Всё принято",
  },
  salesReturn: {
    title: "Возврат от клиента",
    action: "Оформить возврат",
    submitting: "Оформляем...",
    successToast: "Возврат оформлен",
    remainingLabel: "Можно вернуть",
    emptyMessage: "Возвращать нечего",
  },
  purchaseReturn: {
    title: "Возврат поставщику",
    action: "Оформить возврат",
    submitting: "Оформляем...",
    successToast: "Возврат оформлен",
    remainingLabel: "Можно вернуть",
    emptyMessage: "Возвращать нечего",
  },
};

export function FulfillmentPanel({
  orgSlug,
  kind,
  parentId,
  storeOptions,
  defaultStoreId = null,
  lines,
  history,
}: FulfillmentPanelProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [storeId, setStoreId] = useState<string | null>(defaultStoreId);
  const [quantities, setQuantities] = useState<Record<string, string>>({});

  const labels = LABELS[kind];
  const remainingLines = lines
    .map((l) => ({ ...l, remaining: l.ordered - l.fulfilled }))
    .filter((l) => l.remaining > 0);

  function handleSubmit() {
    setError(null);

    if (!storeId) {
      setError("Выберите склад");
      return;
    }

    const requestLines = remainingLines
      .map((l) => ({ catalogItemId: l.catalogItemId, quantity: Number(quantities[l.catalogItemId] || 0) }))
      .filter((l) => l.quantity > 0);

    if (requestLines.length === 0) {
      setError("Укажите количество хотя бы для одной позиции");
      return;
    }

    startTransition(async () => {
      const action = ACTIONS[kind];
      const result = await action(orgSlug, parentId, { storeId, lines: requestLines });
      if (result.error) {
        setError(result.error);
        return;
      }
      toast.success(labels.successToast);
      setQuantities({});
      router.refresh();
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{labels.title}</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {history.length > 0 && (
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>№</TableHead>
                  <TableHead>Склад</TableHead>
                  <TableHead>Дата</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {history.map((h) => (
                  <TableRow key={h.id}>
                    <TableCell>
                      <Link href={`/${orgSlug}/warehouse/${h.id}`} className="underline">
                        №{h.number}
                      </Link>
                    </TableCell>
                    <TableCell>{h.storeName}</TableCell>
                    <TableCell>{h.createdAt}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}

        {remainingLines.length === 0 ? (
          <p className="text-sm text-muted-foreground">{labels.emptyMessage}</p>
        ) : (
          <>
            <div className="flex flex-col gap-2">
              <Label>Склад</Label>
              <EntityCombobox
                options={storeOptions}
                value={storeId}
                onChange={setStoreId}
                placeholder="Выберите склад"
                emptyMessage="Склады не найдены"
              />
            </div>
            <div className="flex flex-col gap-2">
              {remainingLines.map((line) => (
                <div key={line.catalogItemId} className="flex items-center gap-3">
                  <span className="flex-1 text-sm">{line.name}</span>
                  <span className="text-xs text-muted-foreground">
                    {labels.remainingLabel}: {line.remaining}
                  </span>
                  <Input
                    type="number"
                    min="0"
                    max={line.remaining}
                    step="0.001"
                    className="w-28"
                    placeholder="0"
                    value={quantities[line.catalogItemId] ?? ""}
                    onChange={(e) =>
                      setQuantities((prev) => ({ ...prev, [line.catalogItemId]: e.target.value }))
                    }
                  />
                </div>
              ))}
            </div>
            {error && <p className="text-sm text-destructive">{error}</p>}
          </>
        )}
      </CardContent>
      {remainingLines.length > 0 && (
        <CardFooter>
          <Button type="button" onClick={handleSubmit} disabled={isPending}>
            {isPending ? labels.submitting : labels.action}
          </Button>
        </CardFooter>
      )}
    </Card>
  );
}

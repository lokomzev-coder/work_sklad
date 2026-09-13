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
  createSalesReturn,
  createPurchaseReturn,
} from "@/actions/fulfillment";

export interface FulfillmentLine {
  catalogItemId: string;
  // Block M6: which modification this line is for, if any — two lines of
  // the same item but different variants must render/submit as separate
  // rows, not collapse into one (see lineKey below).
  variantId: string | null;
  variantLabel: string | null;
  name: string;
  ordered: number;
  fulfilled: number;
}

function lineKey(catalogItemId: string, variantId: string | null): string {
  return `${catalogItemId}:${variantId ?? ""}`;
}

export interface FulfillmentHistoryEntry {
  id: string;
  number: number;
  createdAt: string;
  storeName: string;
}

// "demand" removed — Отгрузка now goes through "Создать документ" →
// createDraftDemand/postDraftDemand (see components/orders/create-document-menu.tsx),
// not this always-visible inline panel. "supply" removed the same way
// (Block K remainder) — Приёмка now goes through createDraftSupply/
// postDraftSupply (components/purchase-orders/create-supply-button.tsx),
// this panel keeps only the two kinds still atomic create-and-post.
type FulfillmentKind = "salesReturn" | "purchaseReturn";

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

const ACTIONS: Record<FulfillmentKind, typeof createSalesReturn> = {
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
      .map((l) => {
        const key = lineKey(l.catalogItemId, l.variantId);
        return {
          catalogItemId: l.catalogItemId,
          variantId: l.variantId,
          quantity: Number(quantities[key] || 0),
        };
      })
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
              {remainingLines.map((line) => {
                const key = lineKey(line.catalogItemId, line.variantId);
                return (
                  <div key={key} className="flex flex-wrap items-center gap-3">
                    <span className="flex-1 text-sm">
                      {line.name}
                      {line.variantLabel ? ` — ${line.variantLabel}` : ""}
                    </span>
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
                      value={quantities[key] ?? ""}
                      onChange={(e) => setQuantities((prev) => ({ ...prev, [key]: e.target.value }))}
                    />
                  </div>
                );
              })}
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

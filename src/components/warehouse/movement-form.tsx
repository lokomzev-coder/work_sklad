"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { EntityCombobox, type ComboboxOption } from "@/components/forms/entity-combobox";
import { createStockMovement } from "@/actions/stock-movements";

// DEMAND/SUPPLY are created via createDemand/createSupply (actions/fulfillment.ts)
// from the Order/PurchaseOrder detail pages, not through this generic form.
export type ManualMovementType = "ENTER" | "LOSS" | "MOVE" | "INVENTORY";

interface LineRow {
  key: string;
  catalogItemId: string | null;
  quantity: string;
}

interface MovementFormProps {
  orgSlug: string;
  type: ManualMovementType;
  storeOptions: ComboboxOption[];
  catalogOptions: ComboboxOption[];
  /** storeId -> catalogItemId -> current balance, used to show a live
   * reference next to the "actual count" input on inventory documents. */
  balances: Record<string, Record<string, number>>;
}

const TITLE: Record<ManualMovementType, string> = {
  ENTER: "Оприходование",
  LOSS: "Списание",
  MOVE: "Перемещение",
  INVENTORY: "Инвентаризация",
};

function newRow(): LineRow {
  return { key: crypto.randomUUID(), catalogItemId: null, quantity: "" };
}

export function MovementForm({
  orgSlug,
  type,
  storeOptions,
  catalogOptions,
  balances,
}: MovementFormProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [storeId, setStoreId] = useState<string | null>(null);
  const [toStoreId, setToStoreId] = useState<string | null>(null);
  const [comment, setComment] = useState("");
  const [rows, setRows] = useState<LineRow[]>([newRow()]);

  function updateRow(key: string, patch: Partial<LineRow>) {
    setRows((prev) => prev.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  }

  function removeRow(key: string) {
    setRows((prev) => (prev.length > 1 ? prev.filter((r) => r.key !== key) : prev));
  }

  function handleSubmit() {
    setError(null);

    if (!storeId) {
      setError(type === "MOVE" ? "Выберите склад-источник" : "Выберите склад");
      return;
    }
    if (type === "MOVE" && !toStoreId) {
      setError("Выберите склад назначения");
      return;
    }

    const lines = rows
      .filter((r) => r.catalogItemId)
      .map((r) => ({ catalogItemId: r.catalogItemId!, quantity: Number(r.quantity) }));

    if (lines.length === 0) {
      setError("Добавьте хотя бы одну позицию");
      return;
    }
    if (lines.some((l) => !Number.isFinite(l.quantity) || l.quantity < 0)) {
      setError("Проверьте количество в позициях");
      return;
    }

    startTransition(async () => {
      const result = await createStockMovement(orgSlug, type, {
        storeId,
        toStoreId: type === "MOVE" ? toStoreId : undefined,
        comment: comment || undefined,
        lines,
      });
      if (result.error) {
        setError(result.error);
        return;
      }
      router.push(`/${orgSlug}/warehouse`);
    });
  }

  const storeBalances = storeId ? (balances[storeId] ?? {}) : {};

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <CardHeader>
          <CardTitle>{TITLE[type]}</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <div className="flex flex-col gap-2">
            <Label>{type === "MOVE" ? "Откуда" : "Склад"}</Label>
            <EntityCombobox
              options={storeOptions}
              value={storeId}
              onChange={setStoreId}
              placeholder="Выберите склад"
              emptyMessage="Склады не найдены"
            />
          </div>
          {type === "MOVE" && (
            <div className="flex flex-col gap-2">
              <Label>Куда</Label>
              <EntityCombobox
                options={storeOptions.filter((o) => o.value !== storeId)}
                value={toStoreId}
                onChange={setToStoreId}
                placeholder="Выберите склад"
                emptyMessage="Склады не найдены"
              />
            </div>
          )}
          <div className="flex flex-col gap-2 sm:col-span-2">
            <Label htmlFor="comment">Комментарий</Label>
            <Textarea
              id="comment"
              value={comment}
              onChange={(e) => setComment(e.target.value)}
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Позиции</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          {rows.map((row) => {
            const currentBalance =
              row.catalogItemId && storeBalances[row.catalogItemId] !== undefined
                ? storeBalances[row.catalogItemId]
                : 0;
            return (
              <div key={row.key} className="flex items-end gap-2">
                <div className="flex-1">
                  <EntityCombobox
                    options={catalogOptions}
                    value={row.catalogItemId}
                    onChange={(v) => updateRow(row.key, { catalogItemId: v })}
                    placeholder="Выберите товар"
                    emptyMessage="Ничего не найдено"
                  />
                </div>
                {type === "INVENTORY" && row.catalogItemId && (
                  <div className="w-32 shrink-0 text-right text-sm text-muted-foreground">
                    Числится: {currentBalance}
                  </div>
                )}
                <div className="w-32">
                  <Input
                    type="number"
                    min="0"
                    step="0.001"
                    placeholder={type === "INVENTORY" ? "Факт. кол-во" : "Кол-во"}
                    value={row.quantity}
                    onChange={(e) => updateRow(row.key, { quantity: e.target.value })}
                  />
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  disabled={rows.length === 1}
                  onClick={() => removeRow(row.key)}
                >
                  Убрать
                </Button>
              </div>
            );
          })}
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="self-start"
            onClick={() => setRows((prev) => [...prev, newRow()])}
          >
            Добавить позицию
          </Button>
          {error && <p className="text-sm text-destructive">{error}</p>}
        </CardContent>
        <CardFooter>
          <Button type="button" onClick={handleSubmit} disabled={isPending}>
            {isPending ? "Сохранение..." : "Провести"}
          </Button>
        </CardFooter>
      </Card>
    </div>
  );
}

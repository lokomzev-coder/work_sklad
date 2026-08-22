"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { EntityCombobox, type ComboboxOption } from "@/components/forms/entity-combobox";
import { updateBundleComponents } from "@/actions/catalog-bundles";

interface ComponentRow {
  key: string;
  componentId: string | null;
  quantity: string;
}

interface BundleComponentsEditorProps {
  orgSlug: string;
  bundleId: string;
  componentOptions: ComboboxOption[];
  defaultComponents: { componentId: string; quantity: string }[];
}

function newRow(): ComponentRow {
  return { key: crypto.randomUUID(), componentId: null, quantity: "1" };
}

export function BundleComponentsEditor({
  orgSlug,
  bundleId,
  componentOptions,
  defaultComponents,
}: BundleComponentsEditorProps) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [rows, setRows] = useState<ComponentRow[]>(() =>
    defaultComponents.length
      ? defaultComponents.map((c) => ({
          key: crypto.randomUUID(),
          componentId: c.componentId,
          quantity: c.quantity,
        }))
      : [newRow()],
  );

  function updateRow(key: string, patch: Partial<ComponentRow>) {
    setRows((prev) => prev.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  }

  function removeRow(key: string) {
    setRows((prev) => (prev.length > 1 ? prev.filter((r) => r.key !== key) : prev));
  }

  function handleSave() {
    setError(null);
    const components = rows
      .filter((r) => r.componentId)
      .map((r) => ({ componentId: r.componentId!, quantity: Number(r.quantity) }));

    if (components.some((c) => !Number.isFinite(c.quantity) || c.quantity <= 0)) {
      setError("Количество должно быть больше 0");
      return;
    }

    startTransition(async () => {
      const result = await updateBundleComponents(orgSlug, bundleId, { components });
      if (result.error) {
        setError(result.error);
        return;
      }
      toast.success("Состав комплекта сохранён");
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Состав комплекта</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {rows.map((row) => (
          <div key={row.key} className="flex items-end gap-2">
            <div className="flex-1">
              <EntityCombobox
                options={componentOptions}
                value={row.componentId}
                onChange={(v) => updateRow(row.key, { componentId: v })}
                placeholder="Выберите товар/услугу"
                emptyMessage="Ничего не найдено"
              />
            </div>
            <div className="w-28">
              <Input
                type="number"
                min="0.001"
                step="0.001"
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
        ))}
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
        <Button type="button" onClick={handleSave} disabled={isPending}>
          {isPending ? "Сохранение..." : "Сохранить состав"}
        </Button>
      </CardFooter>
    </Card>
  );
}

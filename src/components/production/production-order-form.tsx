"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { EntityCombobox, type ComboboxOption } from "@/components/forms/entity-combobox";
import { CustomFieldsEditor } from "@/components/settings/custom-fields-editor";
import type { CustomFieldDef } from "@/lib/custom-fields";
import { upsertProductionOrder } from "@/actions/production-orders";

interface ProductionOrderFormProps {
  orgSlug: string;
  productionOrderId: string | null;
  techCardOptions: ComboboxOption[];
  storeOptions: ComboboxOption[];
  employeeOptions: ComboboxOption[];
  /** Block I2.2: pre-fills both store pickers on a NEW order with the
   * acting employee's default store, if they have one — ignored once
   * `defaultValues` is set (editing an existing order). */
  defaultStoreId?: string | null;
  /** Disable techCard/stores once completedQuantity > 0 — the recipe/stores
   * a partial run already posted against can't retroactively change. */
  locked?: boolean;
  customFieldDefs?: CustomFieldDef[];
  defaultValues?: {
    techCardId: string | null;
    materialsStoreId: string | null;
    productsStoreId: string | null;
    quantity: string;
    assignedEmployeeId: string | null;
    customFieldValues?: Record<string, string>;
  };
}

export function ProductionOrderForm({
  orgSlug,
  productionOrderId,
  techCardOptions,
  storeOptions,
  employeeOptions,
  defaultStoreId = null,
  locked = false,
  customFieldDefs = [],
  defaultValues,
}: ProductionOrderFormProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [techCardId, setTechCardId] = useState<string | null>(defaultValues?.techCardId ?? null);
  const [materialsStoreId, setMaterialsStoreId] = useState<string | null>(
    defaultValues?.materialsStoreId ?? defaultStoreId,
  );
  const [productsStoreId, setProductsStoreId] = useState<string | null>(
    defaultValues?.productsStoreId ?? defaultStoreId,
  );
  const [quantity, setQuantity] = useState(defaultValues?.quantity ?? "1");
  const [assignedEmployeeId, setAssignedEmployeeId] = useState<string | null>(
    defaultValues?.assignedEmployeeId ?? null,
  );
  const [customFieldValues, setCustomFieldValues] = useState<Record<string, string>>(
    defaultValues?.customFieldValues ?? {},
  );

  function handleSubmit() {
    setError(null);

    if (!techCardId) {
      setError("Выберите техкарту");
      return;
    }
    if (!materialsStoreId) {
      setError("Выберите склад материалов");
      return;
    }
    if (!productsStoreId) {
      setError("Выберите склад продукции");
      return;
    }
    const parsedQuantity = Number(quantity);
    if (!Number.isFinite(parsedQuantity) || parsedQuantity <= 0) {
      setError("Количество должно быть больше 0");
      return;
    }

    startTransition(async () => {
      const result = await upsertProductionOrder(orgSlug, productionOrderId, {
        techCardId,
        materialsStoreId,
        productsStoreId,
        quantity: parsedQuantity,
        assignedEmployeeId,
        customFieldValues,
      });
      if (result.error) {
        setError(result.error);
        return;
      }
      router.push(`/${orgSlug}/production/${result.productionOrderId}`);
    });
  }

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <CardHeader>
          <CardTitle>Производственное задание</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-2">
          <Label>Техкарта</Label>
          <EntityCombobox
            options={techCardOptions}
            value={techCardId}
            onChange={setTechCardId}
            placeholder="Не выбрана"
            emptyMessage="Техкарты не найдены"
            disabled={locked}
          />
          {locked && (
            <p className="text-xs text-muted-foreground">
              Нельзя менять после частичного выполнения задания.
            </p>
          )}
        </div>
        <div className="flex flex-col gap-2">
          <Label>Склад материалов</Label>
          <EntityCombobox
            options={storeOptions}
            value={materialsStoreId}
            onChange={setMaterialsStoreId}
            placeholder="Не выбран"
            emptyMessage="Склады не найдены"
            disabled={locked}
          />
        </div>
        <div className="flex flex-col gap-2">
          <Label>Склад продукции</Label>
          <EntityCombobox
            options={storeOptions}
            value={productsStoreId}
            onChange={setProductsStoreId}
            placeholder="Не выбран"
            emptyMessage="Склады не найдены"
            disabled={locked}
          />
        </div>
        <div className="flex flex-col gap-2">
          <Label>Количество к выпуску</Label>
          <Input
            type="number"
            min="0"
            step="0.001"
            value={quantity}
            onChange={(e) => setQuantity(e.target.value)}
          />
        </div>
        <div className="flex flex-col gap-2">
          <Label>Ответственный сотрудник</Label>
          <EntityCombobox
            options={employeeOptions}
            value={assignedEmployeeId}
            onChange={setAssignedEmployeeId}
            placeholder="Не выбран"
            emptyMessage="Сотрудники не найдены"
          />
        </div>
        </CardContent>
        <CardFooter className="flex flex-col items-start gap-2">
          {error && <p className="text-sm text-destructive">{error}</p>}
          <Button onClick={handleSubmit} disabled={isPending}>
            {productionOrderId ? "Сохранить" : "Создать задание"}
          </Button>
        </CardFooter>
      </Card>

      <CustomFieldsEditor
        defs={customFieldDefs}
        values={customFieldValues}
        onChange={(id, value) => setCustomFieldValues((prev) => ({ ...prev, [id]: value }))}
      />
    </div>
  );
}

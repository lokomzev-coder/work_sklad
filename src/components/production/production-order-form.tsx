"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { EntityCombobox, type ComboboxOption } from "@/components/forms/entity-combobox";
import { upsertProductionOrder } from "@/actions/production-orders";

interface ProductionOrderFormProps {
  orgSlug: string;
  productionOrderId: string | null;
  techCardOptions: ComboboxOption[];
  storeOptions: ComboboxOption[];
  employeeOptions: ComboboxOption[];
  defaultValues?: {
    techCardId: string | null;
    storeId: string | null;
    quantity: string;
    assignedEmployeeId: string | null;
  };
}

export function ProductionOrderForm({
  orgSlug,
  productionOrderId,
  techCardOptions,
  storeOptions,
  employeeOptions,
  defaultValues,
}: ProductionOrderFormProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [techCardId, setTechCardId] = useState<string | null>(defaultValues?.techCardId ?? null);
  const [storeId, setStoreId] = useState<string | null>(defaultValues?.storeId ?? null);
  const [quantity, setQuantity] = useState(defaultValues?.quantity ?? "1");
  const [assignedEmployeeId, setAssignedEmployeeId] = useState<string | null>(
    defaultValues?.assignedEmployeeId ?? null,
  );

  function handleSubmit() {
    setError(null);

    if (!techCardId) {
      setError("Выберите техкарту");
      return;
    }
    if (!storeId) {
      setError("Выберите склад");
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
        storeId,
        quantity: parsedQuantity,
        assignedEmployeeId,
      });
      if (result.error) {
        setError(result.error);
        return;
      }
      router.push(`/${orgSlug}/production/${result.productionOrderId}`);
    });
  }

  return (
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
          />
        </div>
        <div className="flex flex-col gap-2">
          <Label>Склад</Label>
          <EntityCombobox
            options={storeOptions}
            value={storeId}
            onChange={setStoreId}
            placeholder="Не выбран"
            emptyMessage="Склады не найдены"
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
  );
}

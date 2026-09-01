"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { EntityCombobox, type ComboboxOption } from "@/components/forms/entity-combobox";
import { upsertTechCard } from "@/actions/tech-cards";

interface ComponentRow {
  key: string;
  catalogItemId: string | null;
  quantity: string;
  techProcessPositionId: string | null;
}

interface TechProcessOption {
  id: string;
  name: string;
  positions: { id: string; stageName: string }[];
}

interface TechCardFormProps {
  orgSlug: string;
  techCardId: string | null;
  productOptions: ComboboxOption[];
  techProcesses: TechProcessOption[];
  defaultValues?: {
    name: string;
    outputItemId: string | null;
    outputQuantity: string;
    laborCost: string;
    techProcessId: string | null;
    components: { catalogItemId: string; quantity: string; techProcessPositionId: string | null }[];
  };
}

function newRow(): ComponentRow {
  return { key: crypto.randomUUID(), catalogItemId: null, quantity: "1", techProcessPositionId: null };
}

export function TechCardForm({ orgSlug, techCardId, productOptions, techProcesses, defaultValues }: TechCardFormProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState(defaultValues?.name ?? "");
  const [outputItemId, setOutputItemId] = useState<string | null>(defaultValues?.outputItemId ?? null);
  const [outputQuantity, setOutputQuantity] = useState(defaultValues?.outputQuantity ?? "1");
  const [laborCost, setLaborCost] = useState(defaultValues?.laborCost ?? "");
  const [techProcessId, setTechProcessId] = useState<string | null>(defaultValues?.techProcessId ?? null);
  const [rows, setRows] = useState<ComponentRow[]>(() =>
    defaultValues?.components.length
      ? defaultValues.components.map((c) => ({
          key: crypto.randomUUID(),
          catalogItemId: c.catalogItemId,
          quantity: c.quantity,
          techProcessPositionId: c.techProcessPositionId,
        }))
      : [newRow()],
  );

  const techProcessOptions: ComboboxOption[] = techProcesses.map((tp) => ({ value: tp.id, label: tp.name }));
  const selectedTechProcess = techProcesses.find((tp) => tp.id === techProcessId) ?? null;
  const stageOptionsForRow: ComboboxOption[] = selectedTechProcess
    ? selectedTechProcess.positions.map((p, i) => ({ value: p.id, label: `${i + 1}. ${p.stageName}` }))
    : [];

  function updateRow(key: string, patch: Partial<ComponentRow>) {
    setRows((prev) => prev.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  }

  function removeRow(key: string) {
    setRows((prev) => (prev.length > 1 ? prev.filter((r) => r.key !== key) : prev));
  }

  function handleSubmit() {
    setError(null);

    if (!name.trim()) {
      setError("Введите название");
      return;
    }
    if (!outputItemId) {
      setError("Выберите выходной товар");
      return;
    }
    const parsedOutputQuantity = Number(outputQuantity);
    if (!Number.isFinite(parsedOutputQuantity) || parsedOutputQuantity <= 0) {
      setError("Количество выпуска должно быть больше 0");
      return;
    }

    const components = rows
      .filter((r) => r.catalogItemId)
      .map((r) => ({
        catalogItemId: r.catalogItemId!,
        quantity: Number(r.quantity),
        techProcessPositionId: techProcessId ? r.techProcessPositionId : null,
      }));
    if (components.length === 0) {
      setError("Добавьте хотя бы один материал");
      return;
    }
    if (components.some((c) => !Number.isFinite(c.quantity) || c.quantity <= 0)) {
      setError("Количество материала должно быть больше 0");
      return;
    }
    const parsedLaborCost = laborCost.trim() === "" ? null : Number(laborCost);
    if (parsedLaborCost !== null && (!Number.isFinite(parsedLaborCost) || parsedLaborCost < 0)) {
      setError("Стоимость труда/накладных не может быть отрицательной");
      return;
    }

    startTransition(async () => {
      const result = await upsertTechCard(orgSlug, techCardId, {
        name,
        outputItemId,
        outputQuantity: parsedOutputQuantity,
        laborCost: parsedLaborCost,
        techProcessId,
        components,
      });
      if (result.error) {
        setError(result.error);
        return;
      }
      router.push(`/${orgSlug}/production/tech-cards`);
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Технологическая карта</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="flex flex-col gap-2">
            <Label>Название</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="flex flex-col gap-2">
            <Label>Выходной товар</Label>
            <EntityCombobox
              options={productOptions}
              value={outputItemId}
              onChange={setOutputItemId}
              placeholder="Не выбран"
              emptyMessage="Товары не найдены"
            />
          </div>
          <div className="flex flex-col gap-2">
            <Label>Количество на выходе (за 1 партию)</Label>
            <Input
              type="number"
              min="0.001"
              step="0.001"
              value={outputQuantity}
              onChange={(e) => setOutputQuantity(e.target.value)}
            />
          </div>
          <div className="flex flex-col gap-2">
            <Label>Труд/накладные расходы за 1 партию (опционально)</Label>
            <Input
              type="number"
              min="0"
              step="0.01"
              placeholder="0"
              value={laborCost}
              onChange={(e) => setLaborCost(e.target.value)}
            />
          </div>
          <div className="flex flex-col gap-2">
            <Label>Техпроцесс (опционально — многоэтапное производство)</Label>
            <EntityCombobox
              options={techProcessOptions}
              value={techProcessId}
              onChange={setTechProcessId}
              placeholder="Без техпроцесса (одношаговое)"
              emptyMessage="Техпроцессы не найдены"
            />
          </div>
        </div>

        <div className="flex flex-col gap-3">
          <Label>Материалы (на 1 партию)</Label>
          {rows.map((row) => (
            <div key={row.key} className="flex items-end gap-2">
              <div className="flex-1">
                <EntityCombobox
                  options={productOptions}
                  value={row.catalogItemId}
                  onChange={(v) => updateRow(row.key, { catalogItemId: v })}
                  placeholder="Выберите товар"
                  emptyMessage="Товары не найдены"
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
              {selectedTechProcess && (
                <div className="w-44">
                  <EntityCombobox
                    options={stageOptionsForRow}
                    value={row.techProcessPositionId}
                    onChange={(v) => updateRow(row.key, { techProcessPositionId: v })}
                    placeholder="1-й этап"
                    emptyMessage="Этапы не найдены"
                  />
                </div>
              )}
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
            Добавить материал
          </Button>
        </div>
      </CardContent>
      <CardFooter className="flex flex-col items-start gap-2">
        {error && <p className="text-sm text-destructive">{error}</p>}
        <Button onClick={handleSubmit} disabled={isPending}>
          {techCardId ? "Сохранить" : "Создать техкарту"}
        </Button>
      </CardFooter>
    </Card>
  );
}

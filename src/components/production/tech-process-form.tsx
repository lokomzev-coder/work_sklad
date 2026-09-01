"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ArrowUp, ArrowDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { EntityCombobox, type ComboboxOption } from "@/components/forms/entity-combobox";
import { upsertTechProcess } from "@/actions/tech-processes";

interface StageRow {
  key: string;
  processingStageId: string | null;
}

interface TechProcessFormProps {
  orgSlug: string;
  techProcessId: string | null;
  stageOptions: ComboboxOption[];
  defaultValues?: {
    name: string;
    processingStageIds: string[];
  };
}

function newRow(): StageRow {
  return { key: crypto.randomUUID(), processingStageId: null };
}

export function TechProcessForm({ orgSlug, techProcessId, stageOptions, defaultValues }: TechProcessFormProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState(defaultValues?.name ?? "");
  const [rows, setRows] = useState<StageRow[]>(() =>
    defaultValues?.processingStageIds.length
      ? defaultValues.processingStageIds.map((id) => ({ key: crypto.randomUUID(), processingStageId: id }))
      : [newRow()],
  );

  function updateRow(key: string, processingStageId: string | null) {
    setRows((prev) => prev.map((r) => (r.key === key ? { ...r, processingStageId } : r)));
  }

  function removeRow(key: string) {
    setRows((prev) => (prev.length > 1 ? prev.filter((r) => r.key !== key) : prev));
  }

  function moveRow(key: string, direction: "up" | "down") {
    setRows((prev) => {
      const index = prev.findIndex((r) => r.key === key);
      const swapWith = direction === "up" ? index - 1 : index + 1;
      if (index < 0 || swapWith < 0 || swapWith >= prev.length) return prev;
      const next = [...prev];
      [next[index], next[swapWith]] = [next[swapWith], next[index]];
      return next;
    });
  }

  function handleSubmit() {
    setError(null);
    if (!name.trim()) {
      setError("Введите название");
      return;
    }
    const processingStageIds = rows.map((r) => r.processingStageId).filter((id): id is string => !!id);
    if (processingStageIds.length === 0) {
      setError("Добавьте хотя бы один этап");
      return;
    }

    startTransition(async () => {
      const result = await upsertTechProcess(orgSlug, techProcessId, { name, processingStageIds });
      if (result.error) {
        setError(result.error);
        return;
      }
      router.push(`/${orgSlug}/production/tech-processes`);
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Техпроцесс</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="flex flex-col gap-2">
          <Label>Название</Label>
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Например, Выпечка хлеба" />
        </div>

        <div className="flex flex-col gap-3">
          <Label>Этапы, по порядку</Label>
          {rows.map((row, i) => (
            <div key={row.key} className="flex items-center gap-2">
              <div className="flex flex-col">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-5 px-1"
                  disabled={i === 0}
                  onClick={() => moveRow(row.key, "up")}
                >
                  <ArrowUp className="size-3" />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-5 px-1"
                  disabled={i === rows.length - 1}
                  onClick={() => moveRow(row.key, "down")}
                >
                  <ArrowDown className="size-3" />
                </Button>
              </div>
              <span className="w-6 text-sm text-muted-foreground">{i + 1}.</span>
              <div className="flex-1">
                <EntityCombobox
                  options={stageOptions}
                  value={row.processingStageId}
                  onChange={(v) => updateRow(row.key, v)}
                  placeholder="Выберите этап"
                  emptyMessage="Этапы не найдены"
                />
              </div>
              <Button type="button" variant="ghost" size="sm" disabled={rows.length === 1} onClick={() => removeRow(row.key)}>
                Убрать
              </Button>
            </div>
          ))}
          <Button type="button" variant="outline" size="sm" className="self-start" onClick={() => setRows((prev) => [...prev, newRow()])}>
            Добавить этап
          </Button>
        </div>
      </CardContent>
      <CardFooter className="flex flex-col items-start gap-2">
        {error && <p className="text-sm text-destructive">{error}</p>}
        <Button onClick={handleSubmit} disabled={isPending}>
          {techProcessId ? "Сохранить" : "Создать техпроцесс"}
        </Button>
      </CardFooter>
    </Card>
  );
}

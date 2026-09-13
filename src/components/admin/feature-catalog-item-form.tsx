"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { upsertFeatureCatalogItem } from "@/actions/platform-feature-catalog";

export interface FeatureCatalogItemFormValues {
  id: string;
  key: string;
  label: string;
  description: string | null;
  kind: "FEATURE" | "EXTRA_EMPLOYEE_SEAT";
  unitPrice: string;
  includedInAllPlans: boolean;
}

export function FeatureCatalogItemForm({
  item,
  onDone,
}: {
  item?: FeatureCatalogItemFormValues;
  onDone?: () => void;
}) {
  const router = useRouter();
  const [key, setKey] = useState(item?.key ?? "");
  const [label, setLabel] = useState(item?.label ?? "");
  const [description, setDescription] = useState(item?.description ?? "");
  const [kind, setKind] = useState<"FEATURE" | "EXTRA_EMPLOYEE_SEAT">(item?.kind ?? "FEATURE");
  const [unitPrice, setUnitPrice] = useState(item?.unitPrice ?? "0");
  const [includedInAllPlans, setIncludedInAllPlans] = useState(item?.includedInAllPlans ?? false);
  const [isPending, startTransition] = useTransition();

  function handleSubmit() {
    startTransition(async () => {
      const result = await upsertFeatureCatalogItem(item?.id ?? null, {
        key: key.trim(),
        label: label.trim(),
        description: description.trim() || undefined,
        kind,
        unitPrice: Number(unitPrice) || 0,
        includedInAllPlans,
      });
      if (result.error) {
        toast.error(result.error);
        return;
      }
      toast.success(item ? "Пункт обновлён" : "Пункт создан");
      router.refresh();
      onDone?.();
    });
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="flex flex-col gap-2">
          <Label>Ключ (латиница, без пробелов)</Label>
          <Input value={key} onChange={(e) => setKey(e.target.value)} placeholder="retail" disabled={!!item} />
          <p className="text-xs text-muted-foreground">
            Ключи, которые сервис реально проверяет сейчас: <code>retail</code> (розничный модуль),{" "}
            <code>production</code> (производство), <code>custom_roles</code> (гибкие права) — только с этими
            значениями ограничение реально работает, остальные ключи используются только в конструкторе «Свой тариф»
            как обычный платный пункт без технического ограничения.
          </p>
        </div>
        <div className="flex flex-col gap-2">
          <Label>Название</Label>
          <Input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Розничные продажи" />
        </div>
      </div>
      <div className="flex flex-col gap-2">
        <Label>Описание (необязательно)</Label>
        <Input value={description} onChange={(e) => setDescription(e.target.value)} />
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="flex flex-col gap-2">
          <Label>Тип</Label>
          <Select value={kind} onValueChange={(v) => setKind((v as typeof kind) ?? "FEATURE")}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="FEATURE">Функция (вкл/выкл)</SelectItem>
              <SelectItem value="EXTRA_EMPLOYEE_SEAT">Доп. место сотрудника (за штуку)</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="flex flex-col gap-2">
          <Label>Цена в месяц (за единицу)</Label>
          <Input type="number" min="0" step="0.01" value={unitPrice} onChange={(e) => setUnitPrice(e.target.value)} />
        </div>
      </div>
      <label className="flex items-center gap-2 text-sm">
        <Checkbox checked={includedInAllPlans} onCheckedChange={(v) => setIncludedInAllPlans(v === true)} />
        Включено в любую подписку бесплатно (не предлагается к докупке — доступно всем организациям)
      </label>
      <Button type="button" onClick={handleSubmit} disabled={isPending || !key.trim() || !label.trim()}>
        {isPending ? "Сохраняем..." : item ? "Сохранить" : "Создать пункт"}
      </Button>
    </div>
  );
}

"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
  const [includedInAllPlans, setIncludedInAllPlans] = useState(item?.includedInAllPlans ?? false);
  const [isPending, startTransition] = useTransition();

  function handleSubmit() {
    startTransition(async () => {
      const result = await upsertFeatureCatalogItem(item?.id ?? null, {
        key: key.trim(),
        label: label.trim(),
        description: description.trim() || undefined,
        // Block V — the constructor/add-on marketplace this used to price
        // is gone; every catalog item from here on is a plain feature flag
        // (kept as "FEATURE"/0 for schema compatibility with pre-existing
        // rows, not editable here anymore).
        kind: item?.kind ?? "FEATURE",
        unitPrice: item ? Number(item.unitPrice) || 0 : 0,
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
            <code>production</code> (производство), <code>custom_roles</code> (гибкие права),{" "}
            <code>scenarios</code> (автоматические сценарии), <code>custom_fields</code> (дополнительные поля),{" "}
            <code>label_templates</code> (собственные шаблоны этикеток) — только с этими значениями ограничение
            реально работает; любой другой ключ появится в списке функций тарифа на странице тарифа, но ничего не
            будет ограничивать в сервисе.
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

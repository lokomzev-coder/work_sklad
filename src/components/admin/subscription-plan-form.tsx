"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Slider } from "@/components/ui/slider";
import { upsertSubscriptionPlan } from "@/actions/platform-subscription-plans";

// Block U — slider's own practical range (a "typical plan" ballpark); the
// numeric field next to it still accepts any value beyond this, same idea
// as a volume slider that tops out at 100% but the field takes overrides.
const STORAGE_SLIDER_MAX_MB = 10240;
const STORAGE_SLIDER_STEP_MB = 64;

export interface SubscriptionPlanFormValues {
  id: string;
  name: string;
  maxEmployees: number | null;
  maxOrdersPerMonth: number | null;
  maxStorageMb: number | null;
  maxStores: number | null;
  maxLegalEntities: number | null;
  priceMonthly: string;
  currency: string;
  features: Record<string, boolean>;
}

export interface PlanFeatureOption {
  key: string;
  label: string;
  includedInAllPlans: boolean;
}

export function SubscriptionPlanForm({
  plan,
  featureOptions = [],
  onDone,
}: {
  plan?: SubscriptionPlanFormValues;
  /** Block S — active FEATURE-kind catalog items (not EXTRA_EMPLOYEE_SEAT,
   * that one is managed via maxEmployees, not features). */
  featureOptions?: PlanFeatureOption[];
  onDone?: () => void;
}) {
  const router = useRouter();
  const [name, setName] = useState(plan?.name ?? "");
  const [maxEmployees, setMaxEmployees] = useState(plan?.maxEmployees?.toString() ?? "");
  const [maxOrders, setMaxOrders] = useState(plan?.maxOrdersPerMonth?.toString() ?? "");
  const [maxStores, setMaxStores] = useState(plan?.maxStores?.toString() ?? "");
  const [maxLegalEntities, setMaxLegalEntities] = useState(plan?.maxLegalEntities?.toString() ?? "");
  const [storageUnlimited, setStorageUnlimited] = useState(plan ? plan.maxStorageMb == null : true);
  const [maxStorageMb, setMaxStorageMb] = useState(plan?.maxStorageMb?.toString() ?? "1024");
  const [price, setPrice] = useState(plan?.priceMonthly ?? "0");
  const [currency, setCurrency] = useState(plan?.currency ?? "RUB");
  const [features, setFeatures] = useState<Record<string, boolean>>(plan?.features ?? {});
  const [isPending, startTransition] = useTransition();

  function toggleFeature(key: string, checked: boolean) {
    setFeatures((prev) => ({ ...prev, [key]: checked }));
  }

  function handleSubmit() {
    startTransition(async () => {
      const result = await upsertSubscriptionPlan(plan?.id ?? null, {
        name,
        maxEmployees: maxEmployees.trim() ? Number(maxEmployees) : null,
        maxOrdersPerMonth: maxOrders.trim() ? Number(maxOrders) : null,
        maxStorageMb: storageUnlimited ? null : Number(maxStorageMb) || 0,
        maxStores: maxStores.trim() ? Number(maxStores) : null,
        maxLegalEntities: maxLegalEntities.trim() ? Number(maxLegalEntities) : null,
        priceMonthly: Number(price) || 0,
        currency,
        features,
      });
      if (result.error) {
        toast.error(result.error);
        return;
      }
      toast.success(plan ? "Тариф обновлён" : "Тариф создан");
      router.refresh();
      onDone?.();
    });
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <Label>Название</Label>
        <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Например, Стандарт" />
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="flex flex-col gap-2">
          <Label>Макс. сотрудников (пусто = без лимита)</Label>
          <Input type="number" min="1" value={maxEmployees} onChange={(e) => setMaxEmployees(e.target.value)} />
        </div>
        <div className="flex flex-col gap-2">
          <Label>Макс. заказов/мес (пусто = без лимита)</Label>
          <Input type="number" min="1" value={maxOrders} onChange={(e) => setMaxOrders(e.target.value)} />
        </div>
        <div className="flex flex-col gap-2">
          <Label>Точки продаж (пусто = без лимита)</Label>
          <Input type="number" min="1" value={maxStores} onChange={(e) => setMaxStores(e.target.value)} />
        </div>
        <div className="flex flex-col gap-2">
          <Label>Юридические лица (пусто = без лимита)</Label>
          <Input type="number" min="1" value={maxLegalEntities} onChange={(e) => setMaxLegalEntities(e.target.value)} />
        </div>
      </div>
      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <Label>Хранилище (вложения, изображения товаров, файлы экспорта)</Label>
          <label className="flex items-center gap-2 text-sm text-muted-foreground">
            <Checkbox
              checked={storageUnlimited}
              onCheckedChange={(v) => setStorageUnlimited(v === true)}
            />
            Без лимита
          </label>
        </div>
        {!storageUnlimited && (
          <div className="flex items-center gap-3">
            <Slider
              className="flex-1"
              min={0}
              max={STORAGE_SLIDER_MAX_MB}
              step={STORAGE_SLIDER_STEP_MB}
              value={Math.min(Number(maxStorageMb) || 0, STORAGE_SLIDER_MAX_MB)}
              onValueChange={(v) => setMaxStorageMb(String(v))}
            />
            <div className="flex w-36 items-center gap-1">
              <Input
                type="number"
                min="0"
                value={maxStorageMb}
                onChange={(e) => setMaxStorageMb(e.target.value)}
              />
              <span className="text-sm text-muted-foreground">МБ</span>
            </div>
          </div>
        )}
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="flex flex-col gap-2">
          <Label>Цена в месяц</Label>
          <Input type="number" min="0" step="0.01" value={price} onChange={(e) => setPrice(e.target.value)} />
        </div>
        <div className="flex flex-col gap-2">
          <Label>Валюта</Label>
          <Input value={currency} onChange={(e) => setCurrency(e.target.value.toUpperCase())} maxLength={3} />
        </div>
      </div>
      {featureOptions.length > 0 && (
        <div className="flex flex-col gap-2">
          <Label>Функции, входящие в тариф</Label>
          <div className="flex flex-col gap-2 rounded-md border p-3">
            {featureOptions.map((f) => (
              <label key={f.key} className="flex items-center gap-2 text-sm">
                <Checkbox
                  checked={f.includedInAllPlans || !!features[f.key]}
                  disabled={f.includedInAllPlans}
                  onCheckedChange={(v) => toggleFeature(f.key, v === true)}
                />
                {f.label}
                {f.includedInAllPlans && (
                  <span className="text-xs text-muted-foreground">(включено всем бесплатно)</span>
                )}
              </label>
            ))}
          </div>
        </div>
      )}
      <Button type="button" onClick={handleSubmit} disabled={isPending || !name.trim()}>
        {isPending ? "Сохраняем..." : plan ? "Сохранить" : "Создать тариф"}
      </Button>
    </div>
  );
}

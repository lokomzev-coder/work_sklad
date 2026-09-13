"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { upsertSubscriptionPlan } from "@/actions/platform-subscription-plans";

export interface SubscriptionPlanFormValues {
  id: string;
  name: string;
  maxEmployees: number | null;
  maxOrdersPerMonth: number | null;
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

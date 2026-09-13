"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { formatMoney } from "@/lib/format";
import { purchaseSubscriptionAction } from "@/actions/subscription";

export interface CatalogPickerItem {
  id: string;
  key: string;
  label: string;
  description: string | null;
  kind: "FEATURE" | "EXTRA_EMPLOYEE_SEAT";
  unitPrice: string;
}

/**
 * Блок Q — "Свой тариф": организация сама включает функции/доп. места из
 * каталога (src/app/admin/(protected)/feature-catalog управляется
 * платформенным админом), сумма считается на лету. Отправка идёт через
 * тот же purchaseSubscriptionAction, что и готовые тарифы — сервер сам
 * материализует приватный SubscriptionPlan под эту организацию.
 */
export function CustomPlanBuilder({ orgSlug, items, currency }: { orgSlug: string; items: CatalogPickerItem[]; currency: string }) {
  const router = useRouter();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [quantities, setQuantities] = useState<Record<string, number>>({});
  const [isPending, startTransition] = useTransition();

  const total = useMemo(() => {
    let sum = 0;
    for (const item of items) {
      if (!selected.has(item.id)) continue;
      const quantity = item.kind === "EXTRA_EMPLOYEE_SEAT" ? Math.max(1, quantities[item.id] ?? 1) : 1;
      sum += Number(item.unitPrice) * quantity;
    }
    return sum;
  }, [items, selected, quantities]);

  function toggle(id: string, checked: boolean) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });
  }

  function handleSubmit() {
    if (selected.size === 0) {
      toast.error("Выберите хотя бы одну функцию");
      return;
    }
    startTransition(async () => {
      const result = await purchaseSubscriptionAction(orgSlug, {
        kind: "CUSTOM",
        items: Array.from(selected).map((id) => ({
          catalogItemId: id,
          quantity: quantities[id] ?? 1,
        })),
      });
      if (result.error) {
        toast.error(result.error);
        return;
      }
      toast.success(
        result.settled
          ? "Свой тариф оплачен с баланса и активирован"
          : "Счёт выставлен — пополните баланс, чтобы тариф активировался автоматически",
      );
      router.refresh();
    });
  }

  if (items.length === 0) {
    return <p className="text-sm text-muted-foreground">Пункты конструктора пока не настроены</p>;
  }

  return (
    <div className="flex flex-col gap-3">
      {items.map((item) => (
        <div key={item.id} className="flex items-center gap-3 text-sm">
          <Checkbox checked={selected.has(item.id)} onCheckedChange={(checked) => toggle(item.id, checked === true)} />
          <div className="flex-1">
            <p>{item.label}</p>
            {item.description && <p className="text-xs text-muted-foreground">{item.description}</p>}
          </div>
          {item.kind === "EXTRA_EMPLOYEE_SEAT" && selected.has(item.id) && (
            <Input
              type="number"
              min="1"
              className="w-20"
              value={quantities[item.id] ?? 1}
              onChange={(e) => setQuantities((prev) => ({ ...prev, [item.id]: Math.max(1, Number(e.target.value) || 1) }))}
            />
          )}
          <span className="w-28 text-right text-muted-foreground">{formatMoney(Number(item.unitPrice), currency)}</span>
        </div>
      ))}
      <div className="flex items-center justify-between border-t pt-3">
        <span className="text-sm font-medium">Итого в месяц: {formatMoney(total, currency)}</span>
        <Button type="button" size="sm" disabled={isPending || selected.size === 0} onClick={handleSubmit}>
          Оформить свой тариф
        </Button>
      </div>
    </div>
  );
}

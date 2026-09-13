"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Check, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatMoney } from "@/lib/format";
import { purchaseSubscriptionAction } from "@/actions/subscription";

export interface PlanPickerItem {
  id: string;
  name: string;
  priceMonthly: string;
  currency: string;
  maxEmployees: number | null;
  maxOrdersPerMonth: number | null;
  // Block S — Record<featureKey, boolean>, same shape as
  // SubscriptionPlan.features — drives the ✓/— row per catalog feature.
  features: Record<string, boolean>;
}

export interface FeatureRow {
  key: string;
  label: string;
  includedInAllPlans: boolean;
}

/**
 * Блок Q — fixed-plan picker on the org's own subscription page. Buying a
 * plan is a single button: createOrDraftInvoice both creates the invoice
 * and, if the balance already covers it, pays and activates it in the
 * same call — the toast reflects whichever happened.
 *
 * Block S added the ✓/— feature comparison per card, reading from the same
 * catalog the admin's plan-edit checklist and the "Свой тариф" constructor
 * both already use — one list of feature rows, three different renderings.
 */
export function SubscriptionPlanPicker({
  orgSlug,
  plans,
  featureRows = [],
}: {
  orgSlug: string;
  plans: PlanPickerItem[];
  featureRows?: FeatureRow[];
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  function handleBuy(planId: string) {
    startTransition(async () => {
      const result = await purchaseSubscriptionAction(orgSlug, { kind: "PLAN", planId });
      if (result.error) {
        toast.error(result.error);
        return;
      }
      toast.success(
        result.settled
          ? "Тариф оплачен с баланса и активирован"
          : "Счёт выставлен — пополните баланс, чтобы тариф активировался автоматически",
      );
      router.refresh();
    });
  }

  if (plans.length === 0) {
    return <p className="text-sm text-muted-foreground">Готовых тарифов пока нет</p>;
  }

  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {plans.map((plan) => (
        <Card key={plan.id}>
          <CardHeader>
            <CardTitle className="text-base">{plan.name}</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-2 text-sm">
            <p className="text-lg font-semibold">{formatMoney(Number(plan.priceMonthly), plan.currency)} / мес</p>
            <p className="text-muted-foreground">Сотрудников: {plan.maxEmployees ?? "без лимита"}</p>
            <p className="text-muted-foreground">Заказов/мес: {plan.maxOrdersPerMonth ?? "без лимита"}</p>
            {featureRows.length > 0 && (
              <ul className="flex flex-col gap-1 border-t pt-2">
                {featureRows.map((f) => {
                  const included = f.includedInAllPlans || !!plan.features[f.key];
                  return (
                    <li key={f.key} className="flex items-center gap-2">
                      {included ? (
                        <Check className="size-3.5 shrink-0 text-primary" />
                      ) : (
                        <X className="size-3.5 shrink-0 text-muted-foreground" />
                      )}
                      <span className={included ? "" : "text-muted-foreground"}>{f.label}</span>
                    </li>
                  );
                })}
              </ul>
            )}
            <Button type="button" size="sm" disabled={isPending} onClick={() => handleBuy(plan.id)}>
              Оформить
            </Button>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

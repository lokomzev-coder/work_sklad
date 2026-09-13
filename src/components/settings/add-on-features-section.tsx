"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatMoney } from "@/lib/format";
import { purchaseSubscriptionAction } from "@/actions/subscription";

export interface AddOnFeatureItem {
  id: string;
  label: string;
  description: string | null;
  unitPrice: string;
  currency: string;
}

/**
 * Block S — features not already in the org's current plan (and not free
 * for everyone via `includedInAllPlans`) can be bought individually,
 * without switching plans. Reuses purchaseSubscriptionAction/
 * createOrDraftInvoice's existing "ADD_ON" selection kind — the same
 * автовыдача-from-balance flow as buying a whole plan, just for one
 * feature, and without resetting the org's current billing period (see
 * lib/billing/subscription-billing.ts's own comment on `isAddOn`).
 */
export function AddOnFeaturesSection({ orgSlug, items }: { orgSlug: string; items: AddOnFeatureItem[] }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  if (items.length === 0) return null;

  function handleBuy(catalogItemId: string) {
    startTransition(async () => {
      const result = await purchaseSubscriptionAction(orgSlug, {
        kind: "ADD_ON",
        items: [{ catalogItemId, quantity: 1 }],
      });
      if (result.error) {
        toast.error(result.error);
        return;
      }
      toast.success(
        result.settled
          ? "Функция оплачена с баланса и подключена"
          : "Счёт выставлен — пополните баланс, чтобы функция подключилась автоматически",
      );
      router.refresh();
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Дополнительные функции</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <p className="text-sm text-muted-foreground">
          Не входят в текущий тариф — можно докупить отдельно, без смены тарифа. Срок действия подписки при этом не
          меняется.
        </p>
        {items.map((item) => (
          <div key={item.id} className="flex items-center justify-between gap-3 rounded-md border p-3 text-sm">
            <div className="flex flex-col">
              <span className="font-medium">{item.label}</span>
              {item.description && <span className="text-muted-foreground">{item.description}</span>}
            </div>
            <div className="flex items-center gap-3">
              <span className="whitespace-nowrap font-medium">
                {formatMoney(Number(item.unitPrice), item.currency)}/мес
              </span>
              <Button type="button" size="sm" variant="outline" disabled={isPending} onClick={() => handleBuy(item.id)}>
                Докупить
              </Button>
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

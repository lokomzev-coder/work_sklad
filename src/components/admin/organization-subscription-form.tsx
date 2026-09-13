"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { setOrganizationSubscription } from "@/actions/platform-subscriptions";

interface OrganizationSubscriptionFormProps {
  orgId: string;
  currentPlanId: string | null;
  currentExpiresAt: string | null;
  plans: { id: string; name: string }[];
}

export function OrganizationSubscriptionForm({
  orgId,
  currentPlanId,
  currentExpiresAt,
  plans,
}: OrganizationSubscriptionFormProps) {
  const router = useRouter();
  const [planId, setPlanId] = useState(currentPlanId ?? "__none__");
  const [expiresAt, setExpiresAt] = useState(currentExpiresAt ?? "");
  const [isPending, startTransition] = useTransition();

  function handleSubmit() {
    startTransition(async () => {
      const result = await setOrganizationSubscription(
        orgId,
        planId === "__none__" ? null : planId,
        expiresAt || null,
      );
      if (result.error) {
        toast.error(result.error);
        return;
      }
      toast.success("Подписка обновлена");
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <Label>Тариф</Label>
        <Select value={planId} onValueChange={(v) => setPlanId(v ?? "__none__")}>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__none__">Без тарифа (отозвать)</SelectItem>
            {plans.map((p) => (
              <SelectItem key={p.id} value={p.id}>
                {p.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="flex flex-col gap-2">
        <Label>Действует до (пусто — бессрочно)</Label>
        <Input type="date" value={expiresAt} onChange={(e) => setExpiresAt(e.target.value)} />
      </div>
      <Button type="button" onClick={handleSubmit} disabled={isPending} className="self-start">
        {isPending ? "Сохраняем..." : "Сохранить"}
      </Button>
    </div>
  );
}

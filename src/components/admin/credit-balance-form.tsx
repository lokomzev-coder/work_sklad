"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { creditOrganizationBalance } from "@/actions/platform-subscriptions";

/**
 * Блок Q — manual balance top-up, the interim replacement for a real
 * payment provider. If the organization already has a PENDING invoice
 * this covers, it gets auto-settled and the tariff activated right away —
 * the form's own success toast reflects that so the admin doesn't have to
 * go check separately.
 */
export function CreditBalanceForm({ orgId }: { orgId: string }) {
  const router = useRouter();
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [isPending, startTransition] = useTransition();

  function handleSubmit() {
    startTransition(async () => {
      const result = await creditOrganizationBalance(orgId, Number(amount) || 0, note);
      if (result.error) {
        toast.error(result.error);
        return;
      }
      toast.success("Баланс пополнен");
      setAmount("");
      setNote("");
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
      <div className="flex flex-col gap-2">
        <Label>Сумма</Label>
        <Input
          type="number"
          min="0"
          step="0.01"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          className="w-32"
        />
      </div>
      <div className="flex flex-1 flex-col gap-2">
        <Label>Комментарий (например, номер платежа)</Label>
        <Input value={note} onChange={(e) => setNote(e.target.value)} />
      </div>
      <Button type="button" onClick={handleSubmit} disabled={isPending || !(Number(amount) > 0)}>
        {isPending ? "Пополняем..." : "Пополнить баланс"}
      </Button>
    </div>
  );
}

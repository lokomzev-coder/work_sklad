"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { deleteSubscriptionPlan } from "@/actions/platform-subscription-plans";

export function DeleteSubscriptionPlanButton({ id, adminBasePath }: { id: string; adminBasePath: string }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  function handleClick() {
    startTransition(async () => {
      const result = await deleteSubscriptionPlan(id);
      if (result.error) {
        toast.error(result.error);
        return;
      }
      toast.success("Тариф удалён");
      router.push(`${adminBasePath}/plans`);
    });
  }

  return (
    <Button type="button" variant="ghost" size="sm" disabled={isPending} onClick={handleClick}>
      Удалить
    </Button>
  );
}

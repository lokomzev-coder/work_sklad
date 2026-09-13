"use client";

import { useTransition } from "react";
import { toast } from "sonner";
import { Checkbox } from "@/components/ui/checkbox";
import { toggleDiscountActive } from "@/actions/discounts";

export function DiscountActiveToggle({
  orgSlug,
  discountId,
  isActive,
}: {
  orgSlug: string;
  discountId: string;
  isActive: boolean;
}) {
  const [isPending, startTransition] = useTransition();

  function handleChange(checked: boolean) {
    startTransition(async () => {
      const result = await toggleDiscountActive(orgSlug, discountId, checked);
      if (result.error) toast.error(result.error);
    });
  }

  return <Checkbox checked={isActive} disabled={isPending} onCheckedChange={(checked) => handleChange(checked === true)} />;
}

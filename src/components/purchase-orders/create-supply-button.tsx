"use client";

import { useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { createDraftSupply } from "@/actions/fulfillment";

interface CreateSupplyButtonProps {
  orgSlug: string;
  purchaseOrderId: string;
}

/** Same isNextRedirectError idiom as components/orders/create-document-menu.tsx
 * — `createDraftSupply` redirect()s on success, must be re-thrown, not
 * treated as a real error. */
function isNextRedirectError(err: unknown): boolean {
  return (
    typeof err === "object" &&
    err !== null &&
    "digest" in err &&
    typeof (err as { digest?: unknown }).digest === "string" &&
    (err as { digest: string }).digest.startsWith("NEXT_REDIRECT")
  );
}

/** "Приёмка" — Block K remainder: одна кнопка вместо выпадающего меню, у
 * Заказа поставщику пока только один пункт "создать документ" (в отличие
 * от Заказа покупателя с несколькими), заводить целый DropdownMenu ради
 * одной опции было бы лишней абстракцией. */
export function CreateSupplyButton({ orgSlug, purchaseOrderId }: CreateSupplyButtonProps) {
  const [isPending, startTransition] = useTransition();

  function handleClick() {
    startTransition(async () => {
      try {
        const result = await createDraftSupply(orgSlug, purchaseOrderId);
        if (result?.error) {
          toast.error(result.error);
        }
      } catch (err) {
        if (isNextRedirectError(err)) throw err;
        toast.error(err instanceof Error ? err.message : "Не удалось создать приёмку");
      }
    });
  }

  return (
    <Button type="button" variant="outline" size="sm" onClick={handleClick} disabled={isPending}>
      {isPending ? "Создаём..." : "Создать приёмку"}
    </Button>
  );
}

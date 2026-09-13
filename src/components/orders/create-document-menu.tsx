"use client";

import { useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { createDraftDemand, createDraftMoveFromOrder } from "@/actions/fulfillment";
import { createInvoiceFromOrder } from "@/actions/invoices-out";
import { createPaymentFromOrder } from "@/actions/payments";
import { createCashOrderFromOrder } from "@/actions/cash-orders";
import { createDraftPurchaseOrderFromOrder } from "@/actions/purchase-orders";
import { createRetailSaleFromOrder } from "@/actions/retail-sales";

interface CreateDocumentMenuProps {
  orgSlug: string;
  orderId: string;
  canCreateDemand: boolean;
  canCreateInvoice: boolean;
  canCreatePayment: boolean;
  canCreatePurchaseOrder: boolean;
  canCreateRetailSale: boolean;
}

/** Both actions behind this menu redirect() on success (a special Next.js
 * throw, digest-prefixed "NEXT_REDIRECT") — must be re-thrown, not treated
 * as a real error, or the navigation never happens. `createInvoiceFromOrder`
 * throws a plain Error on failure (its established, pre-existing shape);
 * `createDraftDemand` returns `{ error }` instead (new, since "нечего
 * отгружать"/"нет склада по умолчанию" are expected, common conditions that
 * deserve an inline toast, not an uncaught-exception error boundary). */
function isNextRedirectError(err: unknown): boolean {
  return (
    typeof err === "object" &&
    err !== null &&
    "digest" in err &&
    typeof (err as { digest?: unknown }).digest === "string" &&
    (err as { digest: string }).digest.startsWith("NEXT_REDIRECT")
  );
}

export function CreateDocumentMenu({
  orgSlug,
  orderId,
  canCreateDemand,
  canCreateInvoice,
  canCreatePayment,
  canCreatePurchaseOrder,
  canCreateRetailSale,
}: CreateDocumentMenuProps) {
  const [isPending, startTransition] = useTransition();

  if (
    !canCreateDemand &&
    !canCreateInvoice &&
    !canCreatePayment &&
    !canCreatePurchaseOrder &&
    !canCreateRetailSale
  )
    return null;

  function handleDemand() {
    startTransition(async () => {
      try {
        const result = await createDraftDemand(orgSlug, orderId);
        if (result?.error) {
          toast.error(result.error);
        }
      } catch (err) {
        if (isNextRedirectError(err)) throw err;
        toast.error(err instanceof Error ? err.message : "Не удалось создать отгрузку");
      }
    });
  }

  function handleMove() {
    startTransition(async () => {
      try {
        const result = await createDraftMoveFromOrder(orgSlug, orderId);
        if (result?.error) {
          toast.error(result.error);
        }
      } catch (err) {
        if (isNextRedirectError(err)) throw err;
        toast.error(err instanceof Error ? err.message : "Не удалось создать перемещение");
      }
    });
  }

  function handleInvoice() {
    startTransition(async () => {
      try {
        await createInvoiceFromOrder(orgSlug, orderId);
      } catch (err) {
        if (isNextRedirectError(err)) throw err;
        toast.error(err instanceof Error ? err.message : "Не удалось создать счёт");
      }
    });
  }

  function handlePayment() {
    startTransition(async () => {
      try {
        const result = await createPaymentFromOrder(orgSlug, orderId);
        if (result?.error) {
          toast.error(result.error);
        } else {
          toast.success("Платёж создан");
        }
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Не удалось создать платёж");
      }
    });
  }

  function handleCashOrder() {
    startTransition(async () => {
      try {
        const result = await createCashOrderFromOrder(orgSlug, orderId);
        if (result?.error) {
          toast.error(result.error);
        } else {
          toast.success("Приходный ордер создан");
        }
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Не удалось создать приходный ордер");
      }
    });
  }

  function handlePurchaseOrder(onlyShortfall: boolean) {
    startTransition(async () => {
      try {
        const result = await createDraftPurchaseOrderFromOrder(orgSlug, orderId, onlyShortfall);
        if (result?.error) {
          toast.error(result.error);
        }
      } catch (err) {
        if (isNextRedirectError(err)) throw err;
        toast.error(err instanceof Error ? err.message : "Не удалось создать заказ поставщику");
      }
    });
  }

  function handleRetailSale() {
    startTransition(async () => {
      try {
        const result = await createRetailSaleFromOrder(orgSlug, orderId);
        if (result?.error) {
          toast.error(result.error);
        } else {
          toast.success("Розничная продажа оформлена");
        }
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Не удалось оформить розничную продажу");
      }
    });
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button variant="outline" size="sm" disabled={isPending}>
            {isPending ? "Создаём..." : "Создать документ"}
          </Button>
        }
      />
      <DropdownMenuContent align="end">
        {canCreateDemand && (
          <DropdownMenuItem onClick={handleDemand}>Отгрузка</DropdownMenuItem>
        )}
        {canCreateDemand && (
          <DropdownMenuItem onClick={handleMove}>Перемещение</DropdownMenuItem>
        )}
        {canCreateInvoice && (
          <DropdownMenuItem onClick={handleInvoice}>Счёт покупателю</DropdownMenuItem>
        )}
        {canCreatePayment && (
          <DropdownMenuItem onClick={handlePayment}>Входящий платёж</DropdownMenuItem>
        )}
        {canCreatePayment && (
          <DropdownMenuItem onClick={handleCashOrder}>Приходный ордер</DropdownMenuItem>
        )}
        {canCreatePurchaseOrder && (
          <DropdownMenuItem onClick={() => handlePurchaseOrder(false)}>Заказ поставщику</DropdownMenuItem>
        )}
        {canCreatePurchaseOrder && (
          <DropdownMenuItem onClick={() => handlePurchaseOrder(true)}>
            Заказ поставщику (с учётом доступного)
          </DropdownMenuItem>
        )}
        {canCreateRetailSale && (
          <DropdownMenuItem onClick={handleRetailSale}>Розничная продажа</DropdownMenuItem>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

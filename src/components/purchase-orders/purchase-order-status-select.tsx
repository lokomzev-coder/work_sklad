"use client";

import { useTransition } from "react";
import { toast } from "sonner";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { updatePurchaseOrderStatus } from "@/actions/purchase-orders";
import type { PurchaseOrderStatus } from "@/generated/prisma/enums";

const STATUS_ITEMS: Record<PurchaseOrderStatus, string> = {
  DRAFT: "Черновик",
  CONFIRMED: "Подтверждён",
  COMPLETED: "Завершён",
  CANCELLED: "Отменён",
};

interface PurchaseOrderStatusSelectProps {
  orgSlug: string;
  purchaseOrderId: string;
  status: PurchaseOrderStatus;
}

export function PurchaseOrderStatusSelect({
  orgSlug,
  purchaseOrderId,
  status,
}: PurchaseOrderStatusSelectProps) {
  const [isPending, startTransition] = useTransition();

  function handleChange(value: PurchaseOrderStatus | null) {
    if (!value) return;
    startTransition(async () => {
      await updatePurchaseOrderStatus(orgSlug, purchaseOrderId, value);
      toast.success("Статус обновлён");
    });
  }

  return (
    <Select value={status} items={STATUS_ITEMS} onValueChange={handleChange} disabled={isPending}>
      <SelectTrigger className="w-40">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {Object.entries(STATUS_ITEMS).map(([value, label]) => (
          <SelectItem key={value} value={value}>
            {label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

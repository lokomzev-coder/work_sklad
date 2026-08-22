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
import { updateOrderStatus } from "@/actions/orders";
import type { OrderStatus } from "@/generated/prisma/enums";

const STATUS_ITEMS: Record<OrderStatus, string> = {
  DRAFT: "Черновик",
  CONFIRMED: "Подтверждён",
  COMPLETED: "Завершён",
  CANCELLED: "Отменён",
};

interface OrderStatusSelectProps {
  orgSlug: string;
  orderId: string;
  status: OrderStatus;
}

export function OrderStatusSelect({ orgSlug, orderId, status }: OrderStatusSelectProps) {
  const [isPending, startTransition] = useTransition();

  function handleChange(value: OrderStatus | null) {
    if (!value) return;
    startTransition(async () => {
      await updateOrderStatus(orgSlug, orderId, value);
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

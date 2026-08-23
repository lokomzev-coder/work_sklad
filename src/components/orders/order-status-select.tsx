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

interface OrderStatusSelectProps {
  orgSlug: string;
  orderId: string;
  statusId: string;
  statusOptions: { id: string; name: string }[];
}

export function OrderStatusSelect({
  orgSlug,
  orderId,
  statusId,
  statusOptions,
}: OrderStatusSelectProps) {
  const [isPending, startTransition] = useTransition();
  const items = Object.fromEntries(statusOptions.map((s) => [s.id, s.name]));

  function handleChange(value: string | null) {
    if (!value) return;
    startTransition(async () => {
      await updateOrderStatus(orgSlug, orderId, value);
      toast.success("Статус обновлён");
    });
  }

  return (
    <Select value={statusId} items={items} onValueChange={handleChange} disabled={isPending}>
      <SelectTrigger className="w-40">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {statusOptions.map((s) => (
          <SelectItem key={s.id} value={s.id}>
            {s.name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

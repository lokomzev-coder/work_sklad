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
import { updateInvoiceInStatus } from "@/actions/invoices-in";

interface InvoiceInStatusSelectProps {
  orgSlug: string;
  invoiceInId: string;
  statusId: string;
  statusOptions: { id: string; name: string }[];
}

export function InvoiceInStatusSelect({
  orgSlug,
  invoiceInId,
  statusId,
  statusOptions,
}: InvoiceInStatusSelectProps) {
  const [isPending, startTransition] = useTransition();
  const items = Object.fromEntries(statusOptions.map((s) => [s.id, s.name]));

  function handleChange(value: string | null) {
    if (!value) return;
    startTransition(async () => {
      await updateInvoiceInStatus(orgSlug, invoiceInId, value);
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

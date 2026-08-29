"use client";

import { useId, useState, useTransition } from "react";
import { Plus } from "lucide-react";
import { EntityCombobox, type ComboboxOption } from "@/components/forms/entity-combobox";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { quickCreateClient } from "@/actions/clients";

interface ClientComboboxProps {
  orgSlug: string;
  options: ComboboxOption[];
  value: string | null;
  onChange: (value: string | null) => void;
  placeholder?: string;
  searchPlaceholder?: string;
  emptyMessage?: string;
  className?: string;
  disabled?: boolean;
  /** Genitive-case noun used in the create-dialog title/tooltip, e.g. "клиента" / "поставщика" / "контрагента". */
  createLabel?: string;
}

/** EntityCombobox for picking a Client, with a "+" button that opens a minimal
 * inline create form — so orders/purchase orders/contracts/payments never need
 * to leave the page just to add a counterparty that doesn't exist yet. */
export function ClientCombobox({
  orgSlug,
  options: initialOptions,
  value,
  onChange,
  placeholder,
  searchPlaceholder,
  emptyMessage,
  className,
  disabled,
  createLabel = "клиента",
}: ClientComboboxProps) {
  const [options, setOptions] = useState(initialOptions);
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const nameId = useId();
  const phoneId = useId();
  const emailId = useId();

  function reset() {
    setName("");
    setPhone("");
    setEmail("");
    setError(null);
  }

  function handleCreate() {
    setError(null);
    startTransition(async () => {
      const result = await quickCreateClient(orgSlug, {
        name,
        phone: phone || undefined,
        email: email || undefined,
      });
      if (result.error || !result.client) {
        setError(result.error ?? "Не удалось создать");
        return;
      }
      const created = { value: result.client.id, label: result.client.name };
      setOptions((prev) => [created, ...prev]);
      onChange(created.value);
      setOpen(false);
      reset();
    });
  }

  return (
    <div className="flex gap-1.5">
      <EntityCombobox
        options={options}
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        searchPlaceholder={searchPlaceholder}
        emptyMessage={emptyMessage}
        className={className ? className : "flex-1"}
        disabled={disabled}
      />
      <Dialog
        open={open}
        onOpenChange={(next) => {
          setOpen(next);
          if (!next) reset();
        }}
      >
        <DialogTrigger
          render={
            <Button
              type="button"
              variant="outline"
              size="icon"
              disabled={disabled}
              title={`Создать нового ${createLabel}`}
              aria-label={`Создать нового ${createLabel}`}
            >
              <Plus className="size-4" />
            </Button>
          }
        />
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Новый контрагент</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor={nameId}>Название / имя</Label>
              <Input
                id={nameId}
                value={name}
                onChange={(e) => setName(e.target.value)}
                autoFocus
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor={phoneId}>Телефон</Label>
              <Input id={phoneId} value={phone} onChange={(e) => setPhone(e.target.value)} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor={emailId}>Email</Label>
              <Input
                id={emailId}
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>
            {error && <p className="text-sm text-destructive">{error}</p>}
          </div>
          <DialogFooter>
            <DialogClose render={<Button type="button" variant="outline" />}>Отмена</DialogClose>
            <Button type="button" onClick={handleCreate} disabled={isPending || !name.trim()}>
              {isPending ? "Создаём..." : "Создать"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

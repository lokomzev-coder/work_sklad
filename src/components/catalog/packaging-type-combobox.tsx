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
import { quickCreatePackagingType } from "@/actions/catalog-item-packagings";

interface PackagingTypeComboboxProps {
  orgSlug: string;
  options: ComboboxOption[];
  value: string | null;
  onChange: (value: string | null) => void;
  className?: string;
}

/**
 * Block R — pick an existing org-wide packaging kind ("Рулон", "Коробка",
 * "Паллета"...) or quick-create a new one on the fly, exact same shape as
 * ProjectCombobox (src/components/orders/project-combobox.tsx): the new
 * PackagingType shows up as a suggestion the next time this combobox is
 * opened on ANY item in the org — that's the "автоподсказка" the user
 * asked for, it's just the standard org-wide reference-data pattern
 * already used for units/groups/projects, not anything new.
 */
export function PackagingTypeCombobox({
  orgSlug,
  options: initialOptions,
  value,
  onChange,
  className,
}: PackagingTypeComboboxProps) {
  const [options, setOptions] = useState(initialOptions);
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const nameId = useId();

  function handleCreate() {
    setError(null);
    startTransition(async () => {
      const result = await quickCreatePackagingType(orgSlug, name);
      if (result.error || !result.packagingType) {
        setError(result.error ?? "Не удалось создать");
        return;
      }
      const created = { value: result.packagingType.id, label: result.packagingType.name };
      setOptions((prev) => (prev.some((o) => o.value === created.value) ? prev : [created, ...prev]));
      onChange(created.value);
      setOpen(false);
      setName("");
    });
  }

  return (
    <div className={`flex gap-1.5 ${className ?? ""}`}>
      <EntityCombobox
        options={options}
        value={value}
        onChange={onChange}
        placeholder="Выберите вид упаковки"
        emptyMessage="Виды упаковки не найдены"
        className="flex-1"
      />
      <Dialog
        open={open}
        onOpenChange={(next) => {
          setOpen(next);
          if (!next) {
            setName("");
            setError(null);
          }
        }}
      >
        <DialogTrigger
          render={
            <Button type="button" variant="outline" size="icon" title="Новый вид упаковки" aria-label="Новый вид упаковки">
              <Plus className="size-4" />
            </Button>
          }
        />
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Новый вид упаковки</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor={nameId}>Название</Label>
              <Input
                id={nameId}
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Например, Рулон"
                autoFocus
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

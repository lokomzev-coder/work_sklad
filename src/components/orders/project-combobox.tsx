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
import { quickCreateProject } from "@/actions/projects";

interface ProjectComboboxProps {
  orgSlug: string;
  options: ComboboxOption[];
  clientOptions: ComboboxOption[];
  value: string | null;
  onChange: (value: string | null) => void;
  className?: string;
  disabled?: boolean;
}

/** EntityCombobox for picking a Project, with a "+" button that opens a
 * minimal inline create form (Name + optional Client) — mirrors
 * ClientCombobox exactly. Dates/budget/responsible employee are filled in
 * later on the full /projects/[id] page, not here. */
export function ProjectCombobox({
  orgSlug,
  options: initialOptions,
  clientOptions,
  value,
  onChange,
  className,
  disabled,
}: ProjectComboboxProps) {
  const [options, setOptions] = useState(initialOptions);
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [clientId, setClientId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const nameId = useId();

  function reset() {
    setName("");
    setClientId(null);
    setError(null);
  }

  function handleCreate() {
    setError(null);
    startTransition(async () => {
      const result = await quickCreateProject(orgSlug, { name, clientId });
      if (result.error || !result.project) {
        setError(result.error ?? "Не удалось создать");
        return;
      }
      const created = { value: result.project.id, label: result.project.name };
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
        placeholder="Не указан"
        emptyMessage="Проекты не найдены"
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
              title="Создать новый проект"
              aria-label="Создать новый проект"
            >
              <Plus className="size-4" />
            </Button>
          }
        />
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Новый проект</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor={nameId}>Название</Label>
              <Input id={nameId} value={name} onChange={(e) => setName(e.target.value)} autoFocus />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>Клиент</Label>
              <EntityCombobox
                options={clientOptions}
                value={clientId}
                onChange={setClientId}
                placeholder="Не указан"
                emptyMessage="Клиенты не найдены"
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

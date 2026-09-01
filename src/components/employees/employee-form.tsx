"use client";

import Link from "next/link";
import { useActionState, useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardFooter } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogClose,
} from "@/components/ui/dialog";
import { EntityCombobox, type ComboboxOption } from "@/components/forms/entity-combobox";
import type { ActionResult } from "@/actions/employees";
import { createGroup } from "@/actions/groups";

const initialState: ActionResult = {};

/** Block: inline department creation from the employee form itself, so an
 * admin adding a new hire doesn't have to leave to /settings/groups first
 * (mirrors МойСклад's inline "+ Отдел" from the employee card). */
function NewGroupDialog({
  orgSlug,
  onCreated,
}: {
  orgSlug: string;
  onCreated: (option: ComboboxOption) => void;
}) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [isPending, startTransition] = useTransition();

  function handleCreate() {
    if (!name.trim()) return;
    const formData = new FormData();
    formData.set("name", name.trim());
    startTransition(async () => {
      const result = await createGroup(orgSlug, {}, formData);
      if (result.error) {
        toast.error(result.error);
        return;
      }
      onCreated({ value: result.groupId!, label: result.name! });
      setName("");
      setOpen(false);
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <Button type="button" variant="outline" size="sm" onClick={() => setOpen(true)}>
        + Отдел
      </Button>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Новый отдел</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-2 px-4">
          <Label htmlFor="new-group-name">Название</Label>
          <Input
            id="new-group-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), handleCreate())}
            autoFocus
          />
        </div>
        <DialogFooter>
          <DialogClose render={<Button type="button" variant="outline" />}>Отмена</DialogClose>
          <Button type="button" disabled={isPending || !name.trim()} onClick={handleCreate}>
            {isPending ? "Создание..." : "Создать"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

interface EmployeeFormProps {
  orgSlug: string;
  action: (prevState: ActionResult, formData: FormData) => Promise<ActionResult>;
  storeOptions: ComboboxOption[];
  groupOptions: ComboboxOption[];
  defaultValues?: {
    fullName: string;
    position: string | null;
    email: string | null;
    phone: string | null;
    defaultStoreId: string | null;
    groupId: string | null;
  };
  submitLabel: string;
  /** Extra fields rendered inside the SAME <form>, so their inputs land in
   * the same FormData submit as the employee fields above — used on
   * /employees/new to grant system access in one step (see
   * NewEmployeeAccessFields), instead of create-then-reopen-to-configure. */
  children?: React.ReactNode;
}

export function EmployeeForm({
  orgSlug,
  action,
  storeOptions,
  groupOptions,
  defaultValues,
  submitLabel,
  children,
}: EmployeeFormProps) {
  const [state, formAction, pending] = useActionState(action, initialState);
  const [defaultStoreId, setDefaultStoreId] = useState<string | null>(defaultValues?.defaultStoreId ?? null);
  const [groupId, setGroupId] = useState<string | null>(defaultValues?.groupId ?? null);
  const [groups, setGroups] = useState<ComboboxOption[]>(groupOptions);

  return (
    <form action={formAction}>
      <Card>
        <CardContent className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <Label htmlFor="fullName">Имя</Label>
            <Input
              id="fullName"
              name="fullName"
              defaultValue={defaultValues?.fullName}
              required
            />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="position">Должность</Label>
            <Input
              id="position"
              name="position"
              defaultValue={defaultValues?.position ?? ""}
            />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              name="email"
              type="email"
              defaultValue={defaultValues?.email ?? ""}
            />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="phone">Телефон</Label>
            <Input
              id="phone"
              name="phone"
              defaultValue={defaultValues?.phone ?? ""}
            />
          </div>
          <div className="flex flex-col gap-2">
            <Label>Склад по умолчанию</Label>
            <input type="hidden" name="defaultStoreId" value={defaultStoreId ?? ""} />
            <EntityCombobox
              options={storeOptions}
              value={defaultStoreId}
              onChange={setDefaultStoreId}
              placeholder="Не задан"
              emptyMessage="Склады не найдены"
            />
            <p className="text-xs text-muted-foreground">
              Подставляется по умолчанию при создании новых заказов, приёмок/отгрузок и производственных заданий — не ограничивает выбор.
            </p>
          </div>
          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <Label>Отдел</Label>
              <NewGroupDialog
                orgSlug={orgSlug}
                onCreated={(option) => {
                  setGroups((prev) => [...prev, option]);
                  setGroupId(option.value);
                }}
              />
            </div>
            <input type="hidden" name="groupId" value={groupId ?? ""} />
            <EntityCombobox
              options={groups}
              value={groupId}
              onChange={setGroupId}
              placeholder="Без отдела"
              emptyMessage="Отделы не найдены"
            />
            <p className="text-xs text-muted-foreground">
              Для пользовательских ролей с видимостью «свои + отдела» (настраивается в «Роли доступа»).
            </p>
          </div>
          {children}
          {state.error && (
            <p className="text-sm text-destructive">{state.error}</p>
          )}
        </CardContent>
        <CardFooter className="flex gap-2">
          <Button type="submit" disabled={pending}>
            {pending ? "Сохранение..." : submitLabel}
          </Button>
          <Button
            variant="outline"
            render={<Link href={`/${orgSlug}/employees`} />}
          >
            Отмена
          </Button>
        </CardFooter>
      </Card>
    </form>
  );
}

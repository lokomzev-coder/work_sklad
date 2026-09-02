"use client";

import Link from "next/link";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { EntityCombobox } from "@/components/forms/entity-combobox";
import { ROLE_LABELS } from "@/lib/role-labels";
import type { Role } from "@/generated/prisma/enums";

interface RoleOption {
  id: string;
  name: string;
}

/**
 * Rendered as `children` inside `EmployeeForm`'s `<form>` on /employees/new
 * — no `<form>`/action of its own, just fields that land in the same
 * FormData as the employee fields when the page submits. Lets an admin
 * grant login access in the SAME step as creating the employee, instead of
 * create → reopen the card → grant access (the two-step flow this was
 * built to remove). "Выдать доступ" defaults to checked since that's the
 * common case this exists for.
 */
export function NewEmployeeAccessFields({
  orgSlug,
  customRoleOptions,
}: {
  orgSlug: string;
  customRoleOptions: RoleOption[];
}) {
  const [enabled, setEnabled] = useState(true);
  const [role, setRole] = useState<Role>("EMPLOYEE");
  const [customRoleId, setCustomRoleId] = useState<string | null>(null);

  return (
    <div className="flex flex-col gap-4 rounded-md border p-4">
      <label className="flex items-center gap-2 text-sm font-medium">
        <Checkbox checked={enabled} onCheckedChange={(checked) => setEnabled(checked === true)} />
        <input type="hidden" name="wantsAccess" value={enabled ? "1" : ""} />
        Выдать доступ в систему сразу
      </label>
      {!enabled && (
        <p className="text-xs text-muted-foreground">
          Можно будет выдать позже, на карточке сотрудника.
        </p>
      )}
      {enabled && (
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="flex flex-col gap-2">
            <Label htmlFor="new-access-login">Логин</Label>
            <Input id="new-access-login" name="login" placeholder="ivan" required />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="new-access-email">Email для входа</Label>
            <Input id="new-access-email" name="accessEmail" type="email" required />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="new-access-password">Пароль</Label>
            <Input id="new-access-password" name="password" type="password" required />
          </div>
          <div className="flex flex-col gap-2">
            <Label>Базовая роль</Label>
            <input type="hidden" name="role" value={role} />
            <Select value={role} items={ROLE_LABELS} onValueChange={(v) => setRole(v as Role)}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(Object.keys(ROLE_LABELS) as Role[]).map((r) => (
                  <SelectItem key={r} value={r}>
                    {ROLE_LABELS[r]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-2 sm:col-span-2">
            <Label>Пользовательская роль</Label>
            <div className="flex flex-wrap items-center gap-2">
              <input type="hidden" name="customRoleId" value={customRoleId ?? ""} />
              <EntityCombobox
                className="flex-1"
                options={customRoleOptions.map((r) => ({ value: r.id, label: r.name }))}
                value={customRoleId}
                onChange={setCustomRoleId}
                placeholder="Без ограничений (базовая роль)"
                emptyMessage="Роли не найдены"
              />
              <Button
                type="button"
                variant="outline"
                size="sm"
                render={<Link href={`/${orgSlug}/settings/roles/new`} />}
              >
                + Новая роль
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

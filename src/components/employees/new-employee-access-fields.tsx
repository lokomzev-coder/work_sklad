"use client";

import Link from "next/link";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
  const [customRoleId, setCustomRoleId] = useState("");

  return (
    <div className="flex flex-col gap-4 rounded-md border p-4">
      <label className="flex items-center gap-2 text-sm font-medium">
        <input
          type="checkbox"
          name="wantsAccess"
          value="1"
          checked={enabled}
          onChange={(e) => setEnabled(e.target.checked)}
        />
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
            <Label htmlFor="new-access-role">Базовая роль</Label>
            <select
              id="new-access-role"
              name="role"
              value={role}
              onChange={(e) => setRole(e.target.value as Role)}
              className="h-9 rounded-md border bg-background px-3 text-sm"
            >
              <option value="ADMIN">Администратор</option>
              <option value="MANAGER">Менеджер</option>
              <option value="EMPLOYEE">Сотрудник</option>
              <option value="PRODUCTION">Производство (только цех)</option>
            </select>
          </div>
          <div className="flex flex-col gap-2 sm:col-span-2">
            <Label htmlFor="new-access-customRoleId">Пользовательская роль</Label>
            <div className="flex flex-wrap items-center gap-2">
              <select
                id="new-access-customRoleId"
                name="customRoleId"
                value={customRoleId}
                onChange={(e) => setCustomRoleId(e.target.value)}
                className="h-9 rounded-md border bg-background px-3 text-sm"
              >
                <option value="">Без ограничений (базовая роль)</option>
                {customRoleOptions.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.name}
                  </option>
                ))}
              </select>
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

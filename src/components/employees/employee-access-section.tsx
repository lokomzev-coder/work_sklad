"use client";

import { useState, useTransition } from "react";
import { useActionState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  grantEmployeeAccess,
  revokeEmployeeAccess,
  updateEmployeeAccess,
  type ActionResult,
} from "@/actions/memberships";
import type { Role } from "@/generated/prisma/enums";

const initialState: ActionResult = {};

interface RoleOption {
  id: string;
  name: string;
}

interface Membership {
  login: string;
  role: Role;
  customRoleId: string | null;
}

const ROLE_LABELS: Record<Role, string> = {
  ADMIN: "Администратор",
  MANAGER: "Менеджер",
  EMPLOYEE: "Сотрудник",
};

export function EmployeeAccessSection({
  orgSlug,
  orgSlugForLogin,
  employeeId,
  membership,
  customRoleOptions,
}: {
  orgSlug: string;
  orgSlugForLogin: string;
  employeeId: string;
  membership: Membership | null;
  customRoleOptions: RoleOption[];
}) {
  if (membership) {
    return (
      <ExistingAccess
        orgSlug={orgSlug}
        orgSlugForLogin={orgSlugForLogin}
        employeeId={employeeId}
        membership={membership}
        customRoleOptions={customRoleOptions}
      />
    );
  }
  return (
    <GrantAccessForm
      orgSlug={orgSlug}
      employeeId={employeeId}
      customRoleOptions={customRoleOptions}
    />
  );
}

function GrantAccessForm({
  orgSlug,
  employeeId,
  customRoleOptions,
}: {
  orgSlug: string;
  employeeId: string;
  customRoleOptions: RoleOption[];
}) {
  const boundAction = grantEmployeeAccess.bind(null, orgSlug, employeeId);
  const [state, formAction, pending] = useActionState(boundAction, initialState);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Доступ в систему</CardTitle>
      </CardHeader>
      <form action={formAction}>
        <CardContent className="flex flex-col gap-4">
          <p className="text-sm text-muted-foreground">
            У сотрудника пока нет личного входа. Выдайте логин, чтобы он мог заходить сам.
          </p>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-2">
              <Label htmlFor="access-login">Логин</Label>
              <Input id="access-login" name="login" placeholder="ivan" required />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="access-email">Email</Label>
              <Input id="access-email" name="email" type="email" required />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="access-password">Пароль (для нового пользователя)</Label>
              <Input id="access-password" name="password" type="password" />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="access-role">Базовая роль</Label>
              <select id="access-role" name="role" defaultValue="EMPLOYEE" className="h-9 rounded-md border bg-background px-3 text-sm">
                <option value="ADMIN">Администратор</option>
                <option value="MANAGER">Менеджер</option>
                <option value="EMPLOYEE">Сотрудник</option>
              </select>
            </div>
            {customRoleOptions.length > 0 && (
              <div className="flex flex-col gap-2 sm:col-span-2">
                <Label htmlFor="access-customRoleId">Пользовательская роль (видимость заказов)</Label>
                <select
                  id="access-customRoleId"
                  name="customRoleId"
                  defaultValue=""
                  className="h-9 rounded-md border bg-background px-3 text-sm"
                >
                  <option value="">Без ограничений</option>
                  {customRoleOptions.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.name}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>
          {state.error && <p className="text-sm text-destructive">{state.error}</p>}
        </CardContent>
        <CardFooter>
          <Button type="submit" disabled={pending}>
            {pending ? "Выдаём..." : "Выдать доступ"}
          </Button>
        </CardFooter>
      </form>
    </Card>
  );
}

function ExistingAccess({
  orgSlug,
  orgSlugForLogin,
  employeeId,
  membership,
  customRoleOptions,
}: {
  orgSlug: string;
  orgSlugForLogin: string;
  employeeId: string;
  membership: Membership;
  customRoleOptions: RoleOption[];
}) {
  const [isPending, startTransition] = useTransition();
  const [role, setRole] = useState<Role>(membership.role);
  const [customRoleId, setCustomRoleId] = useState(membership.customRoleId ?? "");

  function handleSave() {
    const formData = new FormData();
    formData.set("role", role);
    if (customRoleId) formData.set("customRoleId", customRoleId);
    startTransition(async () => {
      await updateEmployeeAccess(orgSlug, employeeId, formData);
      toast.success("Доступ обновлён");
    });
  }

  function handleRevoke() {
    startTransition(async () => {
      await revokeEmployeeAccess(orgSlug, employeeId);
      toast.success("Доступ отозван");
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Доступ в систему</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <p className="text-sm">
          Логин: <span className="font-medium">{membership.login}@{orgSlugForLogin}</span>
        </p>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="flex flex-col gap-2">
            <Label>Базовая роль</Label>
            <select
              value={role}
              onChange={(e) => setRole(e.target.value as Role)}
              className="h-9 rounded-md border bg-background px-3 text-sm"
            >
              {(Object.keys(ROLE_LABELS) as Role[]).map((r) => (
                <option key={r} value={r}>
                  {ROLE_LABELS[r]}
                </option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-2">
            <Label>Пользовательская роль (видимость заказов)</Label>
            <select
              value={customRoleId}
              onChange={(e) => setCustomRoleId(e.target.value)}
              className="h-9 rounded-md border bg-background px-3 text-sm"
            >
              <option value="">Без ограничений</option>
              {customRoleOptions.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name}
                </option>
              ))}
            </select>
          </div>
        </div>
      </CardContent>
      <CardFooter className="flex gap-2">
        <Button type="button" disabled={isPending} onClick={handleSave}>
          Сохранить
        </Button>
        <AlertDialog>
          <AlertDialogTrigger
            render={
              <Button type="button" variant="outline" disabled={isPending} className="text-destructive hover:text-destructive">
                Отозвать доступ
              </Button>
            }
          />
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Отозвать доступ в систему?</AlertDialogTitle>
              <AlertDialogDescription>
                Сотрудник больше не сможет войти под этим логином. Учётная запись пользователя не
                удаляется — только связь с этой организацией.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Отмена</AlertDialogCancel>
              <AlertDialogAction onClick={handleRevoke}>Отозвать</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </CardFooter>
    </Card>
  );
}

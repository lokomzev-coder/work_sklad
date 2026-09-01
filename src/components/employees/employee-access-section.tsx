"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { useActionState } from "react";
import { useRouter } from "next/navigation";
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
  switchToIndividualRole,
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
  isIndividualRole: boolean;
}

const ROLE_LABELS: Record<Role, string> = {
  ADMIN: "Администратор",
  MANAGER: "Менеджер",
  EMPLOYEE: "Сотрудник",
  PRODUCTION: "Производство (только цех)",
};

/** Block I2.1 — mirrors МойСклад's "Индивидуальные настройки" vs named-role
 * toggle. "custom" mode covers both named-role selection and the
 * individual-permissions link; the distinguishing UI only differs in what
 * the select/link shows. */
type AccessMode = "base" | "named" | "individual";

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
                <option value="PRODUCTION">Производство (только цех)</option>
              </select>
            </div>
            {customRoleOptions.length > 0 && (
              <div className="flex flex-col gap-2 sm:col-span-2">
                <Label htmlFor="access-customRoleId">Пользовательская роль</Label>
                <select
                  id="access-customRoleId"
                  name="customRoleId"
                  defaultValue=""
                  className="h-9 rounded-md border bg-background px-3 text-sm"
                >
                  <option value="">Без ограничений (базовая роль)</option>
                  {customRoleOptions.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.name}
                    </option>
                  ))}
                </select>
                <p className="text-xs text-muted-foreground">
                  Индивидуальные права можно настроить после выдачи доступа.
                </p>
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
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [role, setRole] = useState<Role>(membership.role);
  const initialMode: AccessMode = membership.isIndividualRole ? "individual" : membership.customRoleId ? "named" : "base";
  const [mode, setMode] = useState<AccessMode>(initialMode);
  const [customRoleId, setCustomRoleId] = useState(
    membership.isIndividualRole ? "" : (membership.customRoleId ?? ""),
  );

  function handleModeChange(next: AccessMode) {
    setMode(next);
    if (next === "individual") {
      startTransition(async () => {
        const result = await switchToIndividualRole(orgSlug, employeeId);
        if (result.error) {
          toast.error(result.error);
          return;
        }
        router.push(`/${orgSlug}/employees/${employeeId}/permissions`);
      });
    }
  }

  function handleSave() {
    const formData = new FormData();
    formData.set("role", role);
    if (mode === "named" && customRoleId) formData.set("customRoleId", customRoleId);
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
        <div className="flex flex-col gap-2">
          <Label>Базовая роль</Label>
          <select
            value={role}
            onChange={(e) => setRole(e.target.value as Role)}
            className="h-9 w-fit rounded-md border bg-background px-3 text-sm"
          >
            {(Object.keys(ROLE_LABELS) as Role[]).map((r) => (
              <option key={r} value={r}>
                {ROLE_LABELS[r]}
              </option>
            ))}
          </select>
        </div>

        <div className="flex flex-col gap-2">
          <Label>Права</Label>
          <div className="flex flex-wrap gap-1 rounded-md border p-1 text-sm">
            {(
              [
                { key: "base", label: "Базовая роль" },
                { key: "named", label: "Именная роль" },
                { key: "individual", label: "Индивидуальные настройки" },
              ] as const
            ).map((opt) => (
              <button
                key={opt.key}
                type="button"
                disabled={isPending}
                onClick={() => handleModeChange(opt.key)}
                className={
                  "rounded px-3 py-1 transition-colors " +
                  (mode === opt.key ? "bg-primary text-primary-foreground" : "hover:bg-accent")
                }
              >
                {opt.label}
              </button>
            ))}
          </div>

          {mode === "named" && (
            <div className="flex flex-wrap items-center gap-2">
              <select
                value={customRoleId}
                onChange={(e) => setCustomRoleId(e.target.value)}
                className="h-9 w-fit rounded-md border bg-background px-3 text-sm"
              >
                <option value="">Выберите роль</option>
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
              {customRoleId && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  render={<Link href={`/${orgSlug}/settings/roles/${customRoleId}`} />}
                >
                  Изменить права
                </Button>
              )}
            </div>
          )}

          {mode === "individual" && (
            <Button variant="outline" size="sm" className="w-fit" render={<Link href={`/${orgSlug}/employees/${employeeId}/permissions`} />}>
              Настроить права
            </Button>
          )}
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

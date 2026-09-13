"use client";

import { useActionState, useState } from "react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { EntityCombobox, type ComboboxOption } from "@/components/forms/entity-combobox";
import type { ActionResult } from "@/actions/profile";

const initialState: ActionResult = {};

interface ProfileFormProps {
  action: (prevState: ActionResult, formData: FormData) => Promise<ActionResult>;
  defaultValues: { name: string; email: string };
}

export function ProfileForm({ action, defaultValues }: ProfileFormProps) {
  const [state, formAction, pending] = useActionState(action, initialState);

  return (
    <form action={formAction}>
      <Card>
        <CardHeader>
          <CardTitle>Основная информация</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <Label htmlFor="profile-name">Имя</Label>
            <Input id="profile-name" name="name" defaultValue={defaultValues.name} required />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="profile-email">Email</Label>
            <Input id="profile-email" name="email" type="email" defaultValue={defaultValues.email} required />
          </div>
          {state.error && <p className="text-sm text-destructive">{state.error}</p>}
          {state.success && <p className="text-sm text-muted-foreground">Сохранено</p>}
        </CardContent>
        <CardFooter>
          <Button type="submit" disabled={pending}>
            {pending ? "Сохранение..." : "Сохранить"}
          </Button>
        </CardFooter>
      </Card>
    </form>
  );
}

interface DefaultsFormProps {
  action: (prevState: ActionResult, formData: FormData) => Promise<ActionResult>;
  storeOptions: ComboboxOption[];
  legalEntityOptions: ComboboxOption[];
  defaultValues: {
    defaultStoreId: string | null;
    defaultLegalEntityId: string | null;
    openPdfInBrowser: boolean;
  };
}

/** Block I2.4 — self-service document defaults (store, legal entity), same
 * underlying Employee fields an admin can also set from the employee card
 * (Block I2.2/I2.4) — this is the person configuring it for themselves.
 * Block M4 phase B added `openPdfInBrowser` to the same card — same idea
 * (a personal convenience default), not a new form. */
export function DefaultsForm({ action, storeOptions, legalEntityOptions, defaultValues }: DefaultsFormProps) {
  const [state, formAction, pending] = useActionState(action, initialState);
  const [defaultStoreId, setDefaultStoreId] = useState<string | null>(defaultValues.defaultStoreId);
  const [defaultLegalEntityId, setDefaultLegalEntityId] = useState<string | null>(
    defaultValues.defaultLegalEntityId,
  );

  return (
    <form action={formAction}>
      <Card>
        <CardHeader>
          <CardTitle>Значения по умолчанию</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
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
          </div>
          <div className="flex flex-col gap-2">
            <Label>Юридическое лицо по умолчанию</Label>
            <input type="hidden" name="defaultLegalEntityId" value={defaultLegalEntityId ?? ""} />
            <EntityCombobox
              options={legalEntityOptions}
              value={defaultLegalEntityId}
              onChange={setDefaultLegalEntityId}
              placeholder="Не задано (общее по организации)"
              emptyMessage="Юрлица не найдены"
            />
          </div>
          <p className="text-xs text-muted-foreground">
            Подставляются при создании новых заказов, заказов поставщику, приёмок/отгрузок и
            производственных заданий — не ограничивают выбор.
          </p>
          <label className="flex items-center gap-2 text-sm">
            <Checkbox name="openPdfInBrowser" defaultChecked={defaultValues.openPdfInBrowser} />
            Открывать PDF в браузере (иначе — сразу скачивать файлом)
          </label>
          {state.error && <p className="text-sm text-destructive">{state.error}</p>}
          {state.success && <p className="text-sm text-muted-foreground">Сохранено</p>}
        </CardContent>
        <CardFooter>
          <Button type="submit" disabled={pending}>
            {pending ? "Сохранение..." : "Сохранить"}
          </Button>
        </CardFooter>
      </Card>
    </form>
  );
}

interface ChangePasswordFormProps {
  action: (prevState: ActionResult, formData: FormData) => Promise<ActionResult>;
}

export function ChangePasswordForm({ action }: ChangePasswordFormProps) {
  const [state, formAction, pending] = useActionState(action, initialState);

  return (
    <form action={formAction} key={state.success ? "done" : "pending"}>
      <Card>
        <CardHeader>
          <CardTitle>Смена пароля</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <Label htmlFor="current-password">Текущий пароль</Label>
            <Input id="current-password" name="currentPassword" type="password" required />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="new-password">Новый пароль</Label>
            <Input id="new-password" name="newPassword" type="password" required minLength={8} />
          </div>
          {state.error && <p className="text-sm text-destructive">{state.error}</p>}
          {state.success && <p className="text-sm text-muted-foreground">Пароль изменён</p>}
        </CardContent>
        <CardFooter>
          <Button type="submit" disabled={pending}>
            {pending ? "Сохранение..." : "Сменить пароль"}
          </Button>
        </CardFooter>
      </Card>
    </form>
  );
}

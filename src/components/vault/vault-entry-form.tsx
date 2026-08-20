"use client";

import Link from "next/link";
import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardFooter } from "@/components/ui/card";
import type { ActionResult } from "@/actions/vault";

const initialState: ActionResult = {};

interface VaultEntryFormProps {
  orgSlug: string;
  action: (prevState: ActionResult, formData: FormData) => Promise<ActionResult>;
  defaultValues?: {
    serviceName: string;
    url: string | null;
    username: string | null;
    notes: string | null;
  };
  submitLabel: string;
  isEdit?: boolean;
}

export function VaultEntryForm({
  orgSlug,
  action,
  defaultValues,
  submitLabel,
  isEdit = false,
}: VaultEntryFormProps) {
  const [state, formAction, pending] = useActionState(action, initialState);

  return (
    <form action={formAction}>
      <Card>
        <CardContent className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <Label htmlFor="serviceName">Сервис</Label>
            <Input
              id="serviceName"
              name="serviceName"
              defaultValue={defaultValues?.serviceName}
              required
            />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="url">Адрес</Label>
            <Input
              id="url"
              name="url"
              type="url"
              placeholder="https://..."
              defaultValue={defaultValues?.url ?? ""}
            />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="username">Логин</Label>
            <Input
              id="username"
              name="username"
              autoComplete="off"
              defaultValue={defaultValues?.username ?? ""}
            />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="secret">Пароль / секрет</Label>
            <Input
              id="secret"
              name="secret"
              type="password"
              autoComplete="new-password"
              placeholder={isEdit ? "Оставьте пустым, чтобы не менять" : ""}
              required={!isEdit}
            />
            {isEdit && (
              <p className="text-xs text-muted-foreground">
                Текущий пароль не показывается здесь — он write-only.
                Заполните поле только если хотите его заменить.
              </p>
            )}
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="notes">Заметки</Label>
            <Textarea
              id="notes"
              name="notes"
              rows={3}
              defaultValue={defaultValues?.notes ?? ""}
            />
          </div>
          {state.error && (
            <p className="text-sm text-destructive">{state.error}</p>
          )}
        </CardContent>
        <CardFooter className="flex gap-2">
          <Button type="submit" disabled={pending}>
            {pending ? "Сохранение..." : submitLabel}
          </Button>
          <Button variant="outline" render={<Link href={`/${orgSlug}/vault`} />}>
            Отмена
          </Button>
        </CardFooter>
      </Card>
    </form>
  );
}

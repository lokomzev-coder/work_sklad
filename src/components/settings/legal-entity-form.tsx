"use client";

import Link from "next/link";
import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import type { ActionResult } from "@/actions/legal-entities";

const initialState: ActionResult = {};

interface LegalEntityFormProps {
  orgSlug: string;
  action: (prevState: ActionResult, formData: FormData) => Promise<ActionResult>;
  defaultValues?: {
    name: string;
    inn: string | null;
    kpp: string | null;
    ogrn: string | null;
    address: string | null;
    bankName: string | null;
    bankBik: string | null;
    bankAccount: string | null;
    isDefault: boolean;
  };
  submitLabel: string;
}

export function LegalEntityForm({ orgSlug, action, defaultValues, submitLabel }: LegalEntityFormProps) {
  const [state, formAction, pending] = useActionState(action, initialState);

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <Card>
        <CardContent className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <Label htmlFor="name">Название</Label>
            <Input id="name" name="name" defaultValue={defaultValues?.name} required />
          </div>
          <div className="flex items-center gap-2">
            <Checkbox id="isDefault" name="isDefault" defaultChecked={defaultValues?.isDefault} />
            <Label htmlFor="isDefault" className="font-normal">
              Подставлять по умолчанию в новых документах
            </Label>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Реквизиты</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <div className="flex flex-col gap-2">
            <Label htmlFor="inn">ИНН</Label>
            <Input id="inn" name="inn" defaultValue={defaultValues?.inn ?? ""} />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="kpp">КПП</Label>
            <Input id="kpp" name="kpp" defaultValue={defaultValues?.kpp ?? ""} />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="ogrn">ОГРН</Label>
            <Input id="ogrn" name="ogrn" defaultValue={defaultValues?.ogrn ?? ""} />
          </div>
          <div className="flex flex-col gap-2 sm:col-span-2">
            <Label htmlFor="address">Адрес</Label>
            <Input id="address" name="address" defaultValue={defaultValues?.address ?? ""} />
          </div>
          <div className="flex flex-col gap-2 sm:col-span-2">
            <Label htmlFor="bankName">Банк</Label>
            <Input id="bankName" name="bankName" defaultValue={defaultValues?.bankName ?? ""} />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="bankBik">БИК</Label>
            <Input id="bankBik" name="bankBik" defaultValue={defaultValues?.bankBik ?? ""} />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="bankAccount">Расчётный счёт</Label>
            <Input id="bankAccount" name="bankAccount" defaultValue={defaultValues?.bankAccount ?? ""} />
          </div>
        </CardContent>
      </Card>

      {state.error && <p className="text-sm text-destructive">{state.error}</p>}

      <CardFooter className="flex gap-2 px-0">
        <Button type="submit" disabled={pending}>
          {pending ? "Сохранение..." : submitLabel}
        </Button>
        <Button variant="outline" render={<Link href={`/${orgSlug}/settings/legal-entities`} />}>
          Отмена
        </Button>
      </CardFooter>
    </form>
  );
}

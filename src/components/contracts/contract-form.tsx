"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardFooter } from "@/components/ui/card";
import { EntityCombobox, type ComboboxOption } from "@/components/forms/entity-combobox";
import type { ActionResult } from "@/actions/contracts";

const initialState: ActionResult = {};

interface ContractFormProps {
  orgSlug: string;
  action: (prevState: ActionResult, formData: FormData) => Promise<ActionResult>;
  clientOptions: ComboboxOption[];
}

export function ContractForm({ orgSlug, action, clientOptions }: ContractFormProps) {
  const [state, formAction, pending] = useActionState(action, initialState);
  const [clientId, setClientId] = useState<string | null>(null);

  return (
    <form action={formAction}>
      <Card>
        <CardContent className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <Label htmlFor="number">Номер договора</Label>
            <Input id="number" name="number" required />
          </div>
          <div className="flex flex-col gap-2">
            <Label>Контрагент</Label>
            <input type="hidden" name="clientId" value={clientId ?? ""} />
            <EntityCombobox
              options={clientOptions}
              value={clientId}
              onChange={setClientId}
              placeholder="Выберите контрагента"
              emptyMessage="Контрагенты не найдены"
            />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="signedAt">Дата подписания</Label>
            <Input id="signedAt" name="signedAt" type="date" />
          </div>
          {state.error && <p className="text-sm text-destructive">{state.error}</p>}
        </CardContent>
        <CardFooter className="flex gap-2">
          <Button type="submit" disabled={pending}>
            {pending ? "Сохранение..." : "Создать"}
          </Button>
          <Button variant="outline" render={<Link href={`/${orgSlug}/contracts`} />}>
            Отмена
          </Button>
        </CardFooter>
      </Card>
    </form>
  );
}

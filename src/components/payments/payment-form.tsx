"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardFooter } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { EntityCombobox, type ComboboxOption } from "@/components/forms/entity-combobox";
import type { ActionResult } from "@/actions/payments";

const initialState: ActionResult = {};
const DIRECTION_ITEMS = { IN: "Поступление (от клиента)", OUT: "Выплата (поставщику)" };

interface PaymentFormProps {
  orgSlug: string;
  action: (prevState: ActionResult, formData: FormData) => Promise<ActionResult>;
  counterpartyOptions: ComboboxOption[];
}

export function PaymentForm({ orgSlug, action, counterpartyOptions }: PaymentFormProps) {
  const [state, formAction, pending] = useActionState(action, initialState);
  const [counterpartyId, setCounterpartyId] = useState<string | null>(null);

  return (
    <form action={formAction}>
      <Card>
        <CardContent className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <Label htmlFor="direction">Направление</Label>
            <Select name="direction" items={DIRECTION_ITEMS} defaultValue="IN">
              <SelectTrigger id="direction" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(DIRECTION_ITEMS).map(([value, label]) => (
                  <SelectItem key={value} value={value}>
                    {label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-2">
            <Label>Контрагент</Label>
            <input type="hidden" name="counterpartyId" value={counterpartyId ?? ""} />
            <EntityCombobox
              options={counterpartyOptions}
              value={counterpartyId}
              onChange={setCounterpartyId}
              placeholder="Выберите контрагента"
              emptyMessage="Контрагенты не найдены"
            />
          </div>
          <div className="flex gap-4">
            <div className="flex flex-1 flex-col gap-2">
              <Label htmlFor="amount">Сумма</Label>
              <Input id="amount" name="amount" type="number" step="0.01" min="0.01" required />
            </div>
            <div className="flex w-28 flex-col gap-2">
              <Label htmlFor="currency">Валюта</Label>
              <Input id="currency" name="currency" defaultValue="RUB" />
            </div>
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="comment">Комментарий</Label>
            <Textarea id="comment" name="comment" />
          </div>
          {state.error && <p className="text-sm text-destructive">{state.error}</p>}
        </CardContent>
        <CardFooter className="flex gap-2">
          <Button type="submit" disabled={pending}>
            {pending ? "Сохранение..." : "Записать платёж"}
          </Button>
          <Button variant="outline" render={<Link href={`/${orgSlug}/payments`} />}>
            Отмена
          </Button>
        </CardFooter>
      </Card>
    </form>
  );
}

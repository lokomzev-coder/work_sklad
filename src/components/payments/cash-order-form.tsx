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
import { type ComboboxOption } from "@/components/forms/entity-combobox";
import { ClientCombobox } from "@/components/forms/client-combobox";
import type { ActionResult } from "@/actions/cash-orders";

const initialState: ActionResult = {};
const DIRECTION_ITEMS = { IN: "Приход (например, взнос учредителя)", OUT: "Расход (хоз. нужды, вне закупки)" };
const EMPTY_VALUE = "__none__";

interface CashOrderFormProps {
  orgSlug: string;
  action: (prevState: ActionResult, formData: FormData) => Promise<ActionResult>;
  counterpartyOptions: ComboboxOption[];
  expenseItems: { id: string; name: string }[];
}

export function CashOrderForm({ orgSlug, action, counterpartyOptions, expenseItems }: CashOrderFormProps) {
  const [state, formAction, pending] = useActionState(action, initialState);
  const [direction, setDirection] = useState<"IN" | "OUT">("IN");
  const [counterpartyId, setCounterpartyId] = useState<string | null>(null);

  return (
    <form action={formAction}>
      <Card>
        <CardContent className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <Label htmlFor="direction">Направление</Label>
            <input type="hidden" name="direction" value={direction} />
            <Select items={DIRECTION_ITEMS} value={direction} onValueChange={(v) => setDirection(v as "IN" | "OUT")}>
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
            <Label>Контрагент (необязательно)</Label>
            <input type="hidden" name="counterpartyId" value={counterpartyId ?? ""} />
            <ClientCombobox
              orgSlug={orgSlug}
              options={counterpartyOptions}
              value={counterpartyId}
              onChange={setCounterpartyId}
              placeholder="Без контрагента"
              emptyMessage="Контрагенты не найдены"
              createLabel="контрагента"
            />
          </div>
          {direction === "OUT" && (
            <div className="flex flex-col gap-2">
              <Label htmlFor="expenseItemId">Статья расходов</Label>
              <Select name="expenseItemId" defaultValue={EMPTY_VALUE} items={{ [EMPTY_VALUE]: "—", ...Object.fromEntries(expenseItems.map((e) => [e.id, e.name])) }}>
                <SelectTrigger id="expenseItemId" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={EMPTY_VALUE}>—</SelectItem>
                  {expenseItems.map((e) => (
                    <SelectItem key={e.id} value={e.id}>
                      {e.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
          <div className="flex flex-col gap-2">
            <Label htmlFor="amount">Сумма</Label>
            <Input id="amount" name="amount" type="number" step="0.01" min="0.01" required />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="comment">Комментарий</Label>
            <Textarea id="comment" name="comment" />
          </div>
          {state.error && <p className="text-sm text-destructive">{state.error}</p>}
        </CardContent>
        <CardFooter className="flex gap-2">
          <Button type="submit" disabled={pending}>
            {pending ? "Сохранение..." : "Создать ордер"}
          </Button>
          <Button variant="outline" render={<Link href={`/${orgSlug}/payments/cash-orders`} />}>
            Отмена
          </Button>
        </CardFooter>
      </Card>
    </form>
  );
}

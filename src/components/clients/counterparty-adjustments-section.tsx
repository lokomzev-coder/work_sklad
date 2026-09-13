"use client";

import { useActionState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "@/components/ui/table";
import { formatMoney } from "@/lib/format";
import { createCounterpartyAdjustment, deleteCounterpartyAdjustment, type ActionResult } from "@/actions/counterparty-adjustments";

const initialState: ActionResult = {};
const SIDE_ITEMS = { RECEIVABLE: "Уменьшить «должен нам»", PAYABLE: "Уменьшить «должны ему»" };

export interface CounterpartyAdjustmentRow {
  id: string;
  side: "RECEIVABLE" | "PAYABLE";
  amount: string;
  comment: string | null;
  createdAt: string;
}

interface CounterpartyAdjustmentsSectionProps {
  orgSlug: string;
  clientId: string;
  baseCurrency: string;
  adjustments: CounterpartyAdjustmentRow[];
}

export function CounterpartyAdjustmentsSection({
  orgSlug,
  clientId,
  baseCurrency,
  adjustments,
}: CounterpartyAdjustmentsSectionProps) {
  const boundAction = createCounterpartyAdjustment.bind(null, orgSlug, clientId);
  const [state, formAction, pending] = useActionState(boundAction, initialState);
  const [, startTransition] = useTransition();

  function handleDelete(id: string) {
    startTransition(async () => {
      const result = await deleteCounterpartyAdjustment(orgSlug, clientId, id);
      if (result.error) toast.error(result.error);
      else toast.success("Корректировка удалена");
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Корректировки баланса</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {adjustments.length > 0 && (
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Дата</TableHead>
                  <TableHead>Что</TableHead>
                  <TableHead className="text-right">Сумма</TableHead>
                  <TableHead>Комментарий</TableHead>
                  <TableHead className="w-0" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {adjustments.map((a) => (
                  <TableRow key={a.id}>
                    <TableCell>{new Date(a.createdAt).toLocaleDateString("ru-RU")}</TableCell>
                    <TableCell>{SIDE_ITEMS[a.side]}</TableCell>
                    <TableCell className="text-right">{formatMoney(Number(a.amount), baseCurrency)}</TableCell>
                    <TableCell className="text-muted-foreground">{a.comment ?? "—"}</TableCell>
                    <TableCell className="text-right">
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="text-destructive hover:text-destructive"
                        onClick={() => handleDelete(a.id)}
                      >
                        Удалить
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}

        <form action={formAction} className="grid gap-3 sm:grid-cols-3">
          <div className="flex flex-col gap-2">
            <Label htmlFor="adj-side">Что скорректировать</Label>
            <Select name="side" items={SIDE_ITEMS} defaultValue="RECEIVABLE">
              <SelectTrigger id="adj-side" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(SIDE_ITEMS).map(([value, label]) => (
                  <SelectItem key={value} value={value}>
                    {label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="adj-amount">Сумма</Label>
            <Input id="adj-amount" name="amount" type="number" step="0.01" min="0.01" required />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="adj-comment">Комментарий</Label>
            <Input id="adj-comment" name="comment" placeholder="Прощение долга, перенос сальдо..." />
          </div>
          {state.error && (
            <p className="sm:col-span-3 text-sm text-destructive">{state.error}</p>
          )}
          <CardFooter className="p-0 sm:col-span-3">
            <Button type="submit" disabled={pending}>
              {pending ? "Добавляем..." : "Добавить корректировку"}
            </Button>
          </CardFooter>
        </form>
      </CardContent>
    </Card>
  );
}

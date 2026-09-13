"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { recordCashTransaction, closeShift } from "@/actions/retail-shifts";
import { formatMoney } from "@/lib/format";

interface CashRow {
  id: string;
  type: "CASH_IN" | "CASH_OUT";
  amount: string;
  comment: string | null;
  createdAt: string;
}

export function ShiftPanel({
  orgSlug,
  shiftId,
  openingCashAmount,
  currency,
  cashTransactions,
}: {
  orgSlug: string;
  shiftId: string;
  openingCashAmount: string;
  currency: string;
  cashTransactions: CashRow[];
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [cashAmount, setCashAmount] = useState("");
  const [cashComment, setCashComment] = useState("");
  const [countedCash, setCountedCash] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [closed, setClosed] = useState<{ expected: number; counted: number } | null>(null);

  function handleCashTransaction(type: "CASH_IN" | "CASH_OUT") {
    setError(null);
    startTransition(async () => {
      const result = await recordCashTransaction(orgSlug, shiftId, type, Number(cashAmount), cashComment || undefined);
      if (result.error) {
        setError(result.error);
      } else {
        setCashAmount("");
        setCashComment("");
        router.refresh();
      }
    });
  }

  function handleClose() {
    setError(null);
    startTransition(async () => {
      const result = await closeShift(orgSlug, shiftId, Number(countedCash));
      if (result.error) {
        setError(result.error);
      } else if (result.expectedCashAmount !== undefined && result.countedCashAmount !== undefined) {
        setClosed({ expected: result.expectedCashAmount, counted: result.countedCashAmount });
      }
    });
  }

  return (
    <div className="flex flex-col gap-4">
      {error && <p className="text-sm text-destructive">{error}</p>}

      <Card>
        <CardHeader>
          <CardTitle>Внесение / изъятие наличных</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <div className="flex gap-2">
            <Input type="number" min="0" step="0.01" placeholder="Сумма" value={cashAmount} onChange={(e) => setCashAmount(e.target.value)} />
            <Input placeholder="Комментарий" value={cashComment} onChange={(e) => setCashComment(e.target.value)} />
          </div>
          <div className="flex gap-2">
            <Button type="button" variant="outline" disabled={isPending || !cashAmount} onClick={() => handleCashTransaction("CASH_IN")}>
              Внести
            </Button>
            <Button type="button" variant="outline" disabled={isPending || !cashAmount} onClick={() => handleCashTransaction("CASH_OUT")}>
              Изъять
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Операции за смену</CardTitle>
        </CardHeader>
        <CardContent>
          {cashTransactions.length === 0 ? (
            <p className="text-sm text-muted-foreground">Операций ещё не было</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Когда</TableHead>
                  <TableHead>Тип</TableHead>
                  <TableHead>Сумма</TableHead>
                  <TableHead>Комментарий</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {cashTransactions.map((t) => (
                  <TableRow key={t.id}>
                    <TableCell>{t.createdAt}</TableCell>
                    <TableCell>{t.type === "CASH_IN" ? "Внесение" : "Изъятие"}</TableCell>
                    <TableCell>{formatMoney(Number(t.amount), currency)}</TableCell>
                    <TableCell className="text-muted-foreground">{t.comment ?? "—"}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Закрыть смену</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          {closed ? (
            <>
              <p className="text-sm">
                Ожидалось: {formatMoney(closed.expected, currency)}, посчитано: {formatMoney(closed.counted, currency)}
                {closed.expected !== closed.counted && (
                  <span className="text-destructive"> — расхождение {formatMoney(closed.counted - closed.expected, currency)}</span>
                )}
              </p>
              <Button type="button" onClick={() => router.push(`/${orgSlug}/kassa`)}>
                Вернуться в кассу
              </Button>
            </>
          ) : (
            <>
              <p className="text-sm text-muted-foreground">Открыто с суммой {formatMoney(Number(openingCashAmount), currency)}</p>
              <div className="flex flex-col gap-2">
                <Label>Пересчитанная сумма наличных в кассе</Label>
                <Input type="number" min="0" step="0.01" value={countedCash} onChange={(e) => setCountedCash(e.target.value)} />
              </div>
              <Button type="button" variant="destructive" disabled={isPending || !countedCash} onClick={handleClose}>
                Закрыть смену
              </Button>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

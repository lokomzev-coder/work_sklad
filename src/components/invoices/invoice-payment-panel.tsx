"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { recordInvoiceOutPayment, recordInvoiceInPayment } from "@/actions/invoice-payments";
import { formatMoney } from "@/lib/format";

interface PaymentRow {
  id: string;
  amount: string;
  currency: string;
  createdAt: string;
  comment: string | null;
}

interface InvoicePaymentPanelProps {
  orgSlug: string;
  invoiceId: string;
  invoiceType: "out" | "in";
  sum: number;
  paid: number;
  currency: string;
  payments: PaymentRow[];
}

/** Block M5: the only UI that sets Payment.invoiceOutId/invoiceInId —
 * direction and counterparty are derived server-side from the invoice
 * itself, so this form only ever asks for amount/currency/comment. */
export function InvoicePaymentPanel({
  orgSlug,
  invoiceId,
  invoiceType,
  sum,
  paid,
  currency,
  payments,
}: InvoicePaymentPanelProps) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [amount, setAmount] = useState("");
  const [paymentCurrency, setPaymentCurrency] = useState(currency);
  const [comment, setComment] = useState("");

  function handleSubmit() {
    setError(null);
    const amountNum = Number(amount);
    if (!Number.isFinite(amountNum) || amountNum <= 0) {
      setError("Сумма должна быть больше 0");
      return;
    }

    startTransition(async () => {
      const action = invoiceType === "out" ? recordInvoiceOutPayment : recordInvoiceInPayment;
      const result = await action(orgSlug, invoiceId, {
        amount: amountNum,
        currency: paymentCurrency,
        comment: comment.trim() || undefined,
      });
      if (result.error) {
        setError(result.error);
        return;
      }
      setAmount("");
      setComment("");
      toast.success("Платёж записан");
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>
          Оплата: {formatMoney(paid, currency)} из {formatMoney(sum, currency)}
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="flex flex-wrap items-end gap-2">
          <div className="w-32">
            <Label htmlFor="payment-amount">Сумма</Label>
            <Input
              id="payment-amount"
              type="number"
              min="0.01"
              step="0.01"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
            />
          </div>
          <div className="w-24">
            <Label htmlFor="payment-currency">Валюта</Label>
            <Input
              id="payment-currency"
              value={paymentCurrency}
              onChange={(e) => setPaymentCurrency(e.target.value)}
            />
          </div>
          <div className="flex-1 min-w-[160px]">
            <Label htmlFor="payment-comment">Комментарий</Label>
            <Input id="payment-comment" value={comment} onChange={(e) => setComment(e.target.value)} />
          </div>
          <Button type="button" onClick={handleSubmit} disabled={isPending}>
            {isPending ? "Запись..." : "Записать платёж"}
          </Button>
        </div>
        {error && <p className="text-sm text-destructive">{error}</p>}

        {payments.length > 0 && (
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Когда</TableHead>
                  <TableHead className="text-right">Сумма</TableHead>
                  <TableHead>Комментарий</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {payments.map((p) => (
                  <TableRow key={p.id}>
                    <TableCell>{p.createdAt}</TableCell>
                    <TableCell className="text-right">{formatMoney(Number(p.amount), p.currency)}</TableCell>
                    <TableCell className="text-muted-foreground">{p.comment ?? "—"}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

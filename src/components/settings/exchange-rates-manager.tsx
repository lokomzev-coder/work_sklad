"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "@/components/ui/table";
import { createExchangeRate, deleteExchangeRate, setBaseCurrency } from "@/actions/exchange-rates";

interface Rate {
  id: string;
  currency: string;
  rateToBase: string;
  effectiveAt: string;
}

export function ExchangeRatesManager({
  orgSlug,
  baseCurrency,
  rates,
}: {
  orgSlug: string;
  baseCurrency: string;
  rates: Rate[];
}) {
  const [isPending, startTransition] = useTransition();
  const [base, setBase] = useState(baseCurrency);
  const [currency, setCurrency] = useState("");
  const [rateToBase, setRateToBase] = useState("");

  function handleSaveBase() {
    startTransition(async () => {
      await setBaseCurrency(orgSlug, base);
      toast.success("Базовая валюта обновлена");
    });
  }

  function handleAddRate() {
    if (!currency.trim() || !rateToBase.trim()) return;
    const formData = new FormData();
    formData.set("currency", currency);
    formData.set("rateToBase", rateToBase);
    startTransition(async () => {
      const result = await createExchangeRate(orgSlug, {}, formData);
      if (result.error) {
        toast.error(result.error);
      } else {
        setCurrency("");
        setRateToBase("");
      }
    });
  }

  function handleDelete(id: string) {
    startTransition(async () => {
      await deleteExchangeRate(orgSlug, id);
      toast.success("Курс удалён");
    });
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-end gap-2">
        <div className="flex flex-col gap-2">
          <label className="text-sm font-medium">Базовая валюта</label>
          <Input
            className="h-9 w-28 uppercase"
            value={base}
            onChange={(e) => setBase(e.target.value.toUpperCase())}
            maxLength={10}
          />
        </div>
        <Button type="button" size="sm" disabled={isPending} onClick={handleSaveBase}>
          Сохранить
        </Button>
      </div>
      <p className="text-sm text-muted-foreground">
        Все денежные отчёты и балансы складываются в этой валюте. Платежи и складские операции
        (отгрузки, приёмки) конвертируются по курсу, действовавшему на момент самой операции —
        более поздние изменения курса их не затрагивают. Суммы по заказам/заказам поставщику,
        ещё не превратившимся в такие операции, продолжают конвертироваться по последнему
        известному курсу.
      </p>

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Валюта</TableHead>
              <TableHead>Курс к {base}</TableHead>
              <TableHead>Обновлён</TableHead>
              <TableHead className="w-0" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {rates.map((r) => (
              <TableRow key={r.id}>
                <TableCell className="font-medium">{r.currency}</TableCell>
                <TableCell>{r.rateToBase}</TableCell>
                <TableCell className="text-muted-foreground">{r.effectiveAt}</TableCell>
                <TableCell className="text-right">
                  <Button type="button" variant="ghost" size="sm" disabled={isPending} onClick={() => handleDelete(r.id)}>
                    <X className="size-4" />
                  </Button>
                </TableCell>
              </TableRow>
            ))}
            <TableRow>
              <TableCell>
                <Input
                  placeholder="USD"
                  className="h-8 w-24 uppercase"
                  value={currency}
                  onChange={(e) => setCurrency(e.target.value.toUpperCase())}
                  maxLength={10}
                />
              </TableCell>
              <TableCell>
                <Input
                  placeholder="0.00"
                  type="number"
                  step="any"
                  min="0"
                  className="h-8 w-28"
                  value={rateToBase}
                  onChange={(e) => setRateToBase(e.target.value)}
                />
              </TableCell>
              <TableCell />
              <TableCell className="text-right">
                <Button
                  type="button"
                  size="sm"
                  disabled={isPending || !currency.trim() || !rateToBase.trim()}
                  onClick={handleAddRate}
                >
                  Добавить
                </Button>
              </TableCell>
            </TableRow>
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

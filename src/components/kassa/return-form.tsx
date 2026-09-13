"use client";

import { useState, useTransition, useRef } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ClientCombobox } from "@/components/forms/client-combobox";
import type { ComboboxOption } from "@/components/forms/entity-combobox";
import { checkoutReturn } from "@/actions/retail-sales";
import { formatMoney } from "@/lib/format";

interface CatalogOption {
  id: string;
  name: string;
  barcode: string | null;
  unitPrice: string;
  currency: string;
}

interface CartRow {
  key: string;
  catalogItemId: string;
  name: string;
  quantity: number;
  unitPrice: number;
  currency: string;
}

export function ReturnForm({
  orgSlug,
  catalogOptions,
  clientOptions,
}: {
  orgSlug: string;
  catalogOptions: CatalogOption[];
  clientOptions: ComboboxOption[];
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [query, setQuery] = useState("");
  const [cart, setCart] = useState<CartRow[]>([]);
  const [clientId, setClientId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  const matches = query.trim()
    ? catalogOptions.filter(
        (c) => c.barcode === query.trim() || c.name.toLowerCase().includes(query.trim().toLowerCase()),
      )
    : [];

  function addToCart(item: CatalogOption) {
    setCart((prev) => {
      const existing = prev.find((r) => r.catalogItemId === item.id);
      if (existing) {
        return prev.map((r) => (r.catalogItemId === item.id ? { ...r, quantity: r.quantity + 1 } : r));
      }
      return [...prev, { key: item.id, catalogItemId: item.id, name: item.name, quantity: 1, unitPrice: Number(item.unitPrice), currency: item.currency }];
    });
    setQuery("");
    searchRef.current?.focus();
  }

  function updateQuantity(key: string, quantity: number) {
    if (quantity <= 0) {
      setCart((prev) => prev.filter((r) => r.key !== key));
      return;
    }
    setCart((prev) => prev.map((r) => (r.key === key ? { ...r, quantity } : r)));
  }

  const total = cart.reduce((sum, r) => sum + r.unitPrice * r.quantity, 0);
  const currency = cart[0]?.currency ?? "RUB";

  function handleSubmit() {
    if (cart.length === 0) return;
    setError(null);
    startTransition(async () => {
      const result = await checkoutReturn(orgSlug, {
        lineItems: cart.map((r) => ({ catalogItemId: r.catalogItemId, quantity: r.quantity })),
        clientId,
      });
      if (result.error) {
        setError(result.error);
      } else {
        router.push(`/${orgSlug}/kassa`);
      }
    });
  }

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle>Поиск товара</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <Input ref={searchRef} autoFocus placeholder="Название или штрихкод..." value={query} onChange={(e) => setQuery(e.target.value)} />
          {matches.length > 0 && (
            <div className="flex flex-col gap-1 rounded-md border">
              {matches.slice(0, 10).map((item) => (
                <button key={item.id} type="button" className="flex items-center justify-between px-3 py-2 text-left text-sm hover:bg-muted" onClick={() => addToCart(item)}>
                  <span>{item.name}</span>
                  <span className="text-muted-foreground">{formatMoney(Number(item.unitPrice), item.currency)}</span>
                </button>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Возврат</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {error && <p className="text-sm text-destructive">{error}</p>}
          {cart.length === 0 ? (
            <p className="text-sm text-muted-foreground">Ничего не выбрано</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Товар</TableHead>
                  <TableHead>Кол-во</TableHead>
                  <TableHead>Сумма</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {cart.map((row) => (
                  <TableRow key={row.key}>
                    <TableCell>{row.name}</TableCell>
                    <TableCell>
                      <Input type="number" min="0" step="1" className="w-20" value={row.quantity} onChange={(e) => updateQuantity(row.key, Number(e.target.value))} />
                    </TableCell>
                    <TableCell>{formatMoney(row.unitPrice * row.quantity, row.currency)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}

          <div className="flex flex-col gap-2">
            <span className="text-sm font-medium">Покупатель (необязательно)</span>
            <ClientCombobox orgSlug={orgSlug} options={clientOptions} value={clientId} onChange={setClientId} placeholder="Розничный покупатель" createLabel="покупателя" />
          </div>

          <div className="flex items-center justify-between text-lg font-semibold">
            <span>К возврату</span>
            <span>{formatMoney(total, currency)}</span>
          </div>

          <Button type="button" size="lg" variant="destructive" disabled={isPending || cart.length === 0} onClick={handleSubmit}>
            Оформить возврат
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}

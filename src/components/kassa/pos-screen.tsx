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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ClientCombobox } from "@/components/forms/client-combobox";
import type { ComboboxOption } from "@/components/forms/entity-combobox";
import { checkoutSale } from "@/actions/retail-sales";
import { formatMoney } from "@/lib/format";

interface VariantOption {
  id: string;
  label: string;
  price: string | null;
  barcode: string | null;
}

interface CatalogOption {
  id: string;
  name: string;
  barcode: string | null;
  unitPrice: string;
  currency: string;
  variants: VariantOption[];
}

interface CartRow {
  key: string;
  catalogItemId: string;
  variantId: string | null;
  name: string;
  quantity: number;
  unitPrice: number;
  currency: string;
}

const PAYMENT_METHOD_LABELS = { CASH: "Наличные", CARD: "Карта" };

export function PosScreen({
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
  const [paymentMethod, setPaymentMethod] = useState<"CASH" | "CARD">("CASH");
  const [error, setError] = useState<string | null>(null);
  const [waitingForCard, setWaitingForCard] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);

  const matches = query.trim()
    ? catalogOptions.filter(
        (c) =>
          c.barcode === query.trim() ||
          c.variants.some((v) => v.barcode === query.trim()) ||
          c.name.toLowerCase().includes(query.trim().toLowerCase()),
      )
    : [];
  const exactBarcodeMatch = catalogOptions.find((c) => c.barcode === query.trim());

  function addToCart(item: CatalogOption, variant?: VariantOption) {
    setCart((prev) => {
      const key = `${item.id}:${variant?.id ?? ""}`;
      const existing = prev.find((r) => r.key === key);
      if (existing) {
        return prev.map((r) => (r.key === key ? { ...r, quantity: r.quantity + 1 } : r));
      }
      return [
        ...prev,
        {
          key,
          catalogItemId: item.id,
          variantId: variant?.id ?? null,
          name: variant ? `${item.name} — ${variant.label}` : item.name,
          quantity: 1,
          unitPrice: Number(variant?.price ?? item.unitPrice),
          currency: item.currency,
        },
      ];
    });
    setQuery("");
    searchRef.current?.focus();
  }

  function handleSearchKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter" && exactBarcodeMatch) {
      e.preventDefault();
      addToCart(exactBarcodeMatch);
    }
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

  function handleCheckout() {
    if (cart.length === 0) return;
    setError(null);
    if (paymentMethod === "CARD") setWaitingForCard(true);
    startTransition(async () => {
      const result = await checkoutSale(orgSlug, {
        lineItems: cart.map((r) => ({ catalogItemId: r.catalogItemId, variantId: r.variantId, quantity: r.quantity })),
        clientId,
        paymentMethod,
      });
      setWaitingForCard(false);
      if (result.error) {
        setError(result.error);
      } else if (result.saleId) {
        router.push(`/${orgSlug}/kassa/sale/${result.saleId}`);
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
          <Input
            ref={searchRef}
            autoFocus
            placeholder="Название или штрихкод..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleSearchKeyDown}
          />
          {matches.length > 0 && (
            <div className="flex flex-col gap-1 rounded-md border">
              {matches.slice(0, 10).map((item) =>
                item.variants.length > 0 ? (
                  item.variants.map((v) => (
                    <button
                      key={v.id}
                      type="button"
                      className="flex items-center justify-between px-3 py-2 text-left text-sm hover:bg-muted"
                      onClick={() => addToCart(item, v)}
                    >
                      <span>{item.name} — {v.label}</span>
                      <span className="text-muted-foreground">{formatMoney(Number(v.price ?? item.unitPrice), item.currency)}</span>
                    </button>
                  ))
                ) : (
                  <button
                    key={item.id}
                    type="button"
                    className="flex items-center justify-between px-3 py-2 text-left text-sm hover:bg-muted"
                    onClick={() => addToCart(item)}
                  >
                    <span>{item.name}</span>
                    <span className="text-muted-foreground">{formatMoney(Number(item.unitPrice), item.currency)}</span>
                  </button>
                ),
              )}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Корзина</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {error && <p className="text-sm text-destructive">{error}</p>}
          {cart.length === 0 ? (
            <p className="text-sm text-muted-foreground">Корзина пуста</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Товар</TableHead>
                  <TableHead>Кол-во</TableHead>
                  <TableHead>Сумма</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {cart.map((row) => (
                  <TableRow key={row.key}>
                    <TableCell>{row.name}</TableCell>
                    <TableCell>
                      <Input
                        type="number"
                        min="0"
                        step="1"
                        className="w-20"
                        value={row.quantity}
                        onChange={(e) => updateQuantity(row.key, Number(e.target.value))}
                      />
                    </TableCell>
                    <TableCell>{formatMoney(row.unitPrice * row.quantity, row.currency)}</TableCell>
                    <TableCell>
                      <Button type="button" variant="ghost" size="sm" onClick={() => updateQuantity(row.key, 0)}>
                        Убрать
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}

          <div className="flex flex-col gap-2">
            <span className="text-sm font-medium">Покупатель (необязательно)</span>
            <ClientCombobox
              orgSlug={orgSlug}
              options={clientOptions}
              value={clientId}
              onChange={setClientId}
              placeholder="Розничный покупатель"
              createLabel="покупателя"
            />
          </div>

          <div className="flex flex-col gap-2">
            <span className="text-sm font-medium">Способ оплаты</span>
            <Select value={paymentMethod} items={PAYMENT_METHOD_LABELS} onValueChange={(v) => setPaymentMethod(v as "CASH" | "CARD")}>
              <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="CASH">Наличные</SelectItem>
                <SelectItem value="CARD">Карта</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="flex items-center justify-between text-lg font-semibold">
            <span>Итого</span>
            <span>{formatMoney(total, currency)}</span>
          </div>

          {waitingForCard ? (
            <p className="text-sm text-muted-foreground">Ожидание оплаты картой…</p>
          ) : (
            <Button type="button" size="lg" disabled={isPending || cart.length === 0} onClick={handleCheckout}>
              Оформить продажу
            </Button>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { EntityCombobox, type ComboboxOption } from "@/components/forms/entity-combobox";
import { ClientCombobox } from "@/components/forms/client-combobox";
import { CustomFieldsEditor } from "@/components/settings/custom-fields-editor";
import { upsertInvoiceIn } from "@/actions/invoices-in";
import type { CustomFieldDef } from "@/lib/custom-fields";
import { formatMoney } from "@/lib/format";

interface VariantOption {
  id: string;
  label: string;
}

interface CatalogOption {
  id: string;
  name: string;
  unitPrice: string;
  currency: string;
  variants: VariantOption[];
}

interface LineItemRow {
  key: string;
  catalogItemId: string | null;
  variantId: string | null;
  quantity: string;
  unitCost: string;
}

interface InvoiceInFormProps {
  orgSlug: string;
  invoiceInId: string | null;
  supplierOptions: ComboboxOption[];
  catalogOptions: CatalogOption[];
  contractOptions: ComboboxOption[];
  legalEntityOptions: ComboboxOption[];
  customFieldDefs?: CustomFieldDef[];
  /** Block M5: shown as a read-only informational link when this invoice
   * was created via "Создать счёт" from a purchase order. */
  sourcePurchaseOrder?: { number: number; href: string } | null;
  defaultValues?: {
    supplierId: string | null;
    contractId: string | null;
    legalEntityId: string | null;
    lineItems: { catalogItemId: string; variantId: string | null; quantity: string; unitCost: string }[];
    customFieldValues?: Record<string, string>;
  };
}

function newRow(defaultCost = ""): LineItemRow {
  return { key: crypto.randomUUID(), catalogItemId: null, variantId: null, quantity: "1", unitCost: defaultCost };
}

export function InvoiceInForm({
  orgSlug,
  invoiceInId,
  supplierOptions,
  catalogOptions,
  contractOptions,
  legalEntityOptions,
  customFieldDefs = [],
  sourcePurchaseOrder = null,
  defaultValues,
}: InvoiceInFormProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [supplierId, setSupplierId] = useState<string | null>(defaultValues?.supplierId ?? null);
  const [contractId, setContractId] = useState<string | null>(defaultValues?.contractId ?? null);
  const [legalEntityId, setLegalEntityId] = useState<string | null>(defaultValues?.legalEntityId ?? null);
  const [customFieldValues, setCustomFieldValues] = useState<Record<string, string>>(
    defaultValues?.customFieldValues ?? {},
  );
  const [rows, setRows] = useState<LineItemRow[]>(() =>
    defaultValues?.lineItems.length
      ? defaultValues.lineItems.map((li) => ({
          key: crypto.randomUUID(),
          catalogItemId: li.catalogItemId,
          variantId: li.variantId,
          quantity: li.quantity,
          unitCost: li.unitCost,
        }))
      : [newRow()],
  );

  const catalogItemComboOptions: ComboboxOption[] = catalogOptions.map((c) => ({
    value: c.id,
    label: `${c.name} — ${c.unitPrice} ${c.currency}`,
  }));

  const catalogById = new Map(catalogOptions.map((c) => [c.id, c]));

  const total = rows.reduce((sum, row) => sum + (Number(row.unitCost) || 0) * (Number(row.quantity) || 0), 0);
  const totalCurrency =
    rows.map((row) => (row.catalogItemId ? catalogById.get(row.catalogItemId) : undefined)).find(Boolean)
      ?.currency ?? "RUB";

  function updateRow(key: string, patch: Partial<LineItemRow>) {
    setRows((prev) => prev.map((row) => (row.key === key ? { ...row, ...patch } : row)));
  }

  function removeRow(key: string) {
    setRows((prev) => (prev.length > 1 ? prev.filter((r) => r.key !== key) : prev));
  }

  function handleSubmit() {
    setError(null);

    const lineItems = rows
      .filter((r) => r.catalogItemId)
      .map((r) => ({
        catalogItemId: r.catalogItemId!,
        variantId: r.variantId,
        quantity: Number(r.quantity),
        unitCost: Number(r.unitCost),
      }));

    if (lineItems.length === 0) {
      setError("Добавьте хотя бы одну позицию");
      return;
    }
    if (lineItems.some((li) => !Number.isFinite(li.quantity) || li.quantity <= 0)) {
      setError("Количество должно быть больше 0");
      return;
    }
    if (lineItems.some((li) => !Number.isFinite(li.unitCost) || li.unitCost < 0)) {
      setError("Цена не может быть отрицательной");
      return;
    }

    startTransition(async () => {
      const result = await upsertInvoiceIn(orgSlug, invoiceInId, {
        supplierId,
        contractId,
        legalEntityId,
        lineItems,
        customFieldValues,
      });
      if (result.error) {
        setError(result.error);
        return;
      }
      router.push(`/${orgSlug}/invoices-in`);
    });
  }

  return (
    <div className="flex flex-col gap-4">
      {sourcePurchaseOrder && (
        <p className="text-sm text-muted-foreground">
          Создан из заказа поставщику{" "}
          <Link href={sourcePurchaseOrder.href} className="font-medium hover:underline">
            №{sourcePurchaseOrder.number}
          </Link>
        </p>
      )}
      <Card>
        <CardHeader>
          <CardTitle>Поставщик</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <div className="flex flex-col gap-2">
            <Label>Поставщик</Label>
            <ClientCombobox
              orgSlug={orgSlug}
              options={supplierOptions}
              value={supplierId}
              onChange={setSupplierId}
              placeholder="Не выбран"
              emptyMessage="Контрагенты не найдены"
              createLabel="поставщика"
            />
          </div>
          <div className="flex flex-col gap-2">
            <Label>Договор</Label>
            <EntityCombobox
              options={contractOptions}
              value={contractId}
              onChange={setContractId}
              placeholder="Без договора"
              emptyMessage="Договоры не найдены"
            />
          </div>
          <div className="flex flex-col gap-2">
            <Label>Юрлицо</Label>
            <EntityCombobox
              options={legalEntityOptions}
              value={legalEntityId}
              onChange={setLegalEntityId}
              placeholder="Не указано"
              emptyMessage="Юрлица не найдены"
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Позиции</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          {rows.map((row) => {
            const item = row.catalogItemId ? catalogById.get(row.catalogItemId) : undefined;
            const subtotal = (Number(row.unitCost) || 0) * (Number(row.quantity) || 0);
            const variantOptions: ComboboxOption[] =
              item?.variants.map((v) => ({ value: v.id, label: v.label })) ?? [];

            return (
              <div key={row.key} className="flex flex-col gap-2 border-b pb-3 last:border-b-0 last:pb-0">
                <div className="flex flex-wrap items-end gap-2">
                  <div className="min-w-[200px] basis-full sm:basis-auto sm:flex-1">
                    <EntityCombobox
                      options={catalogItemComboOptions}
                      value={row.catalogItemId}
                      onChange={(v) =>
                        updateRow(row.key, {
                          catalogItemId: v,
                          variantId: null,
                          unitCost: row.unitCost || (v ? (catalogById.get(v)?.unitPrice ?? "") : ""),
                        })
                      }
                      placeholder="Выберите товар/услугу"
                      emptyMessage="Ничего не найдено"
                    />
                  </div>
                  <div className="w-24">
                    <Input
                      type="number"
                      min="0.001"
                      step="0.001"
                      value={row.quantity}
                      onChange={(e) => updateRow(row.key, { quantity: e.target.value })}
                    />
                  </div>
                  <div className="w-28">
                    <Input
                      type="number"
                      min="0"
                      step="0.01"
                      placeholder="Цена"
                      value={row.unitCost}
                      onChange={(e) => updateRow(row.key, { unitCost: e.target.value })}
                    />
                  </div>
                  <div className="w-28 shrink-0 text-right text-sm text-muted-foreground">
                    {item ? formatMoney(subtotal, item.currency) : "—"}
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    disabled={rows.length === 1}
                    onClick={() => removeRow(row.key)}
                  >
                    Убрать
                  </Button>
                </div>
                {variantOptions.length > 0 && (
                  <div className="w-full sm:w-64">
                    <EntityCombobox
                      options={variantOptions}
                      value={row.variantId}
                      onChange={(v) => updateRow(row.key, { variantId: v })}
                      placeholder="Выберите модификацию"
                      emptyMessage="Модификации не найдены"
                    />
                  </div>
                )}
              </div>
            );
          })}
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="self-start"
            onClick={() => setRows((prev) => [...prev, newRow()])}
          >
            Добавить позицию
          </Button>

          <div className="mt-2 flex justify-end text-base font-semibold">
            Итого: {formatMoney(total, totalCurrency)}
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}
        </CardContent>
        <CardFooter className="flex gap-2">
          <Button type="button" onClick={handleSubmit} disabled={isPending}>
            {isPending ? "Сохранение..." : "Сохранить счёт"}
          </Button>
        </CardFooter>
      </Card>

      <CustomFieldsEditor
        defs={customFieldDefs}
        values={customFieldValues}
        onChange={(id, value) => setCustomFieldValues((prev) => ({ ...prev, [id]: value }))}
      />
    </div>
  );
}

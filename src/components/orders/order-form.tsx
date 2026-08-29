"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { EntityCombobox, type ComboboxOption } from "@/components/forms/entity-combobox";
import { ClientCombobox } from "@/components/forms/client-combobox";
import { CustomFieldsEditor } from "@/components/settings/custom-fields-editor";
import { upsertOrder } from "@/actions/orders";
import type { CustomFieldDef } from "@/lib/custom-fields";
import { formatMoney } from "@/lib/format";

interface VariantOption {
  id: string;
  label: string;
  price: string | null;
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
}

interface OrderFormProps {
  orgSlug: string;
  orderId: string | null;
  clientOptions: ComboboxOption[];
  employeeOptions: ComboboxOption[];
  catalogOptions: CatalogOption[];
  contractOptions: ComboboxOption[];
  salesChannelOptions: ComboboxOption[];
  legalEntityOptions: ComboboxOption[];
  customFieldDefs?: CustomFieldDef[];
  defaultValues?: {
    clientId: string | null;
    assignedEmployeeId: string | null;
    contractId: string | null;
    salesChannelId: string | null;
    legalEntityId: string | null;
    lineItems: { catalogItemId: string; variantId: string | null; quantity: string }[];
    customFieldValues?: Record<string, string>;
  };
}

function newRow(): LineItemRow {
  return { key: crypto.randomUUID(), catalogItemId: null, variantId: null, quantity: "1" };
}

export function OrderForm({
  orgSlug,
  orderId,
  clientOptions,
  employeeOptions,
  catalogOptions,
  contractOptions,
  salesChannelOptions,
  legalEntityOptions,
  customFieldDefs = [],
  defaultValues,
}: OrderFormProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [clientId, setClientId] = useState<string | null>(
    defaultValues?.clientId ?? null,
  );
  const [assignedEmployeeId, setAssignedEmployeeId] = useState<string | null>(
    defaultValues?.assignedEmployeeId ?? null,
  );
  const [contractId, setContractId] = useState<string | null>(
    defaultValues?.contractId ?? null,
  );
  const [salesChannelId, setSalesChannelId] = useState<string | null>(
    defaultValues?.salesChannelId ?? null,
  );
  const [legalEntityId, setLegalEntityId] = useState<string | null>(
    defaultValues?.legalEntityId ?? null,
  );
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
        }))
      : [newRow()],
  );

  const catalogItemComboOptions: ComboboxOption[] = catalogOptions.map((c) => ({
    value: c.id,
    label: `${c.name} — ${c.unitPrice} ${c.currency}`,
  }));

  const catalogById = new Map(catalogOptions.map((c) => [c.id, c]));

  function lineUnitPrice(row: LineItemRow, item: CatalogOption | undefined): number {
    if (!item) return 0;
    if (row.variantId) {
      const variant = item.variants.find((v) => v.id === row.variantId);
      if (variant?.price) return Number(variant.price);
    }
    return Number(item.unitPrice);
  }

  const total = rows.reduce((sum, row) => {
    if (!row.catalogItemId) return sum;
    const item = catalogById.get(row.catalogItemId);
    const qty = Number(row.quantity) || 0;
    return sum + lineUnitPrice(row, item) * qty;
  }, 0);
  const totalCurrency =
    rows.map((row) => (row.catalogItemId ? catalogById.get(row.catalogItemId) : undefined)).find(Boolean)
      ?.currency ?? "RUB";

  function updateRow(key: string, patch: Partial<LineItemRow>) {
    setRows((prev) =>
      prev.map((row) => (row.key === key ? { ...row, ...patch } : row)),
    );
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
      }));

    if (lineItems.length === 0) {
      setError("Добавьте хотя бы одну позицию");
      return;
    }
    if (lineItems.some((li) => !Number.isFinite(li.quantity) || li.quantity <= 0)) {
      setError("Количество должно быть больше 0");
      return;
    }

    startTransition(async () => {
      const result = await upsertOrder(orgSlug, orderId, {
        clientId,
        assignedEmployeeId,
        contractId,
        salesChannelId,
        legalEntityId,
        lineItems,
        customFieldValues,
      });
      if (result.error) {
        setError(result.error);
        return;
      }
      router.push(`/${orgSlug}/orders`);
    });
  }

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <CardHeader>
          <CardTitle>Клиент и ответственный</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <div className="flex flex-col gap-2">
            <Label>Клиент</Label>
            <ClientCombobox
              orgSlug={orgSlug}
              options={clientOptions}
              value={clientId}
              onChange={setClientId}
              placeholder="Не выбран"
              emptyMessage="Клиенты не найдены"
              createLabel="клиента"
            />
          </div>
          <div className="flex flex-col gap-2">
            <Label>Ответственный сотрудник</Label>
            <EntityCombobox
              options={employeeOptions}
              value={assignedEmployeeId}
              onChange={setAssignedEmployeeId}
              placeholder="Не выбран"
              emptyMessage="Сотрудники не найдены"
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
            <Label>Канал продаж</Label>
            <EntityCombobox
              options={salesChannelOptions}
              value={salesChannelId}
              onChange={setSalesChannelId}
              placeholder="Не указан"
              emptyMessage="Каналы не найдены"
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
            const unitPrice = lineUnitPrice(row, item);
            const subtotal = unitPrice * (Number(row.quantity) || 0);
            const variantOptions: ComboboxOption[] =
              item?.variants.map((v) => ({ value: v.id, label: v.label })) ?? [];

            return (
              <div key={row.key} className="flex flex-col gap-2 border-b pb-3 last:border-b-0 last:pb-0">
                <div className="flex flex-wrap items-end gap-2">
                  <div className="min-w-[200px] basis-full sm:basis-auto sm:flex-1">
                    <EntityCombobox
                      options={catalogItemComboOptions}
                      value={row.catalogItemId}
                      onChange={(v) => updateRow(row.key, { catalogItemId: v, variantId: null })}
                      placeholder="Выберите товар/услугу"
                      emptyMessage="Ничего не найдено"
                    />
                  </div>
                  <div className="w-28">
                    <Input
                      type="number"
                      min="0.001"
                      step="0.001"
                      value={row.quantity}
                      onChange={(e) => updateRow(row.key, { quantity: e.target.value })}
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
            {isPending ? "Сохранение..." : "Сохранить заказ"}
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

"use client";

import Link from "next/link";
import { useActionState, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  EntityCombobox,
  type ComboboxOption,
} from "@/components/forms/entity-combobox";
import { CustomFieldsSection } from "@/components/settings/custom-fields-section";
import { generateBarcode, type ActionResult } from "@/actions/catalog";
import type { CustomFieldDef } from "@/lib/custom-fields";
import { TAX_RATE_LABELS } from "@/lib/tax-rate-labels";

const initialState: ActionResult = {};
const NONE_VALUE = "__none__";
// Base UI's <Select.Value> renders the raw value unless the root is given an
// `items` value->label map — without it, selecting "PRODUCT" would literally
// display the text "PRODUCT" instead of "Товар".
const TYPE_ITEMS = { PRODUCT: "Товар", SERVICE: "Услуга", BUNDLE: "Комплект" };

interface CatalogItemFormProps {
  orgSlug: string;
  action: (prevState: ActionResult, formData: FormData) => Promise<ActionResult>;
  unitOptions: ComboboxOption[];
  groupOptions: ComboboxOption[];
  customFieldDefs?: CustomFieldDef[];
  customFieldValues?: Record<string, string>;
  defaultValues?: {
    name: string;
    type: "PRODUCT" | "SERVICE" | "BUNDLE";
    sku: string | null;
    barcode: string | null;
    unitPrice: string | number;
    currency: string;
    unitId: string | null;
    groupId: string | null;
    taxRate?: string;
    minStock?: string | number | null;
  };
  submitLabel: string;
}

export function CatalogItemForm({
  orgSlug,
  action,
  unitOptions,
  groupOptions,
  defaultValues,
  submitLabel,
  customFieldDefs = [],
  customFieldValues = {},
}: CatalogItemFormProps) {
  const [state, formAction, pending] = useActionState(action, initialState);
  const [groupId, setGroupId] = useState<string | null>(
    defaultValues?.groupId ?? null,
  );
  const barcodeRef = useRef<HTMLInputElement>(null);
  const [isGeneratingBarcode, setIsGeneratingBarcode] = useState(false);

  async function handleGenerateBarcode() {
    setIsGeneratingBarcode(true);
    try {
      const result = await generateBarcode(orgSlug);
      if ("barcode" in result && barcodeRef.current) {
        barcodeRef.current.value = result.barcode;
      }
    } finally {
      setIsGeneratingBarcode(false);
    }
  }

  return (
    <form action={formAction}>
      <Card>
        <CardContent className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <Label htmlFor="name">Название</Label>
            <Input
              id="name"
              name="name"
              defaultValue={defaultValues?.name}
              required
            />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="type">Тип</Label>
            <Select
              name="type"
              items={TYPE_ITEMS}
              defaultValue={defaultValues?.type ?? "PRODUCT"}
            >
              <SelectTrigger id="type" className="w-full">
                <SelectValue placeholder="Выберите тип" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="PRODUCT">Товар</SelectItem>
                <SelectItem value="SERVICE">Услуга</SelectItem>
                <SelectItem value="BUNDLE">Комплект</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex gap-4">
            <div className="flex flex-1 flex-col gap-2">
              <Label htmlFor="sku">Артикул</Label>
              <Input
                id="sku"
                name="sku"
                defaultValue={defaultValues?.sku ?? ""}
              />
            </div>
            <div className="flex flex-1 flex-col gap-2">
              <Label htmlFor="barcode">Штрихкод</Label>
              <div className="flex gap-2">
                <Input
                  id="barcode"
                  name="barcode"
                  ref={barcodeRef}
                  defaultValue={defaultValues?.barcode ?? ""}
                />
                <Button
                  type="button"
                  variant="outline"
                  onClick={handleGenerateBarcode}
                  disabled={isGeneratingBarcode}
                >
                  {isGeneratingBarcode ? "..." : "Сгенерировать"}
                </Button>
              </div>
            </div>
          </div>
          <div className="flex gap-4">
            <div className="flex flex-1 flex-col gap-2">
              <Label htmlFor="unitPrice">Цена</Label>
              <Input
                id="unitPrice"
                name="unitPrice"
                type="number"
                step="0.01"
                min="0"
                defaultValue={defaultValues?.unitPrice?.toString()}
                required
              />
            </div>
            <div className="flex w-28 flex-col gap-2">
              <Label htmlFor="currency">Валюта</Label>
              <Input
                id="currency"
                name="currency"
                defaultValue={defaultValues?.currency ?? "RUB"}
              />
            </div>
            <div className="flex w-40 flex-col gap-2">
              <Label htmlFor="unitId">Единица</Label>
              <Select
                name="unitId"
                items={{
                  [NONE_VALUE]: "—",
                  ...Object.fromEntries(unitOptions.map((o) => [o.value, o.label])),
                }}
                defaultValue={defaultValues?.unitId ?? NONE_VALUE}
              >
                <SelectTrigger id="unitId" className="w-full">
                  <SelectValue placeholder="—" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE_VALUE}>—</SelectItem>
                  {unitOptions.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="flex w-40 flex-col gap-2">
            <Label htmlFor="minStock">Мин. остаток</Label>
            <Input
              id="minStock"
              name="minStock"
              type="number"
              step="0.001"
              min="0"
              placeholder="Не отслеживать"
              defaultValue={defaultValues?.minStock?.toString() ?? ""}
            />
          </div>
          <div className="flex w-64 flex-col gap-2">
            <Label htmlFor="taxRate">Ставка НДС</Label>
            <Select
              name="taxRate"
              items={TAX_RATE_LABELS}
              defaultValue={defaultValues?.taxRate ?? "NONE"}
            >
              <SelectTrigger id="taxRate" className="w-full">
                <SelectValue placeholder="Без НДС" />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(TAX_RATE_LABELS).map(([value, label]) => (
                  <SelectItem key={value} value={value}>
                    {label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-2">
            <Label>Группа</Label>
            <input type="hidden" name="groupId" value={groupId ?? ""} />
            <EntityCombobox
              options={groupOptions}
              value={groupId}
              onChange={setGroupId}
              placeholder="Без группы"
              searchPlaceholder="Поиск группы..."
              emptyMessage="Группы не найдены"
            />
          </div>
        </CardContent>
      </Card>

      <div className="mt-4">
        <CustomFieldsSection defs={customFieldDefs} values={customFieldValues} />
      </div>

      {state.error && (
        <p className="mt-4 text-sm text-destructive">{state.error}</p>
      )}

      <div className="mt-4 flex gap-2">
        <Button type="submit" disabled={pending}>
          {pending ? "Сохранение..." : submitLabel}
        </Button>
        <Button
          variant="outline"
          render={<Link href={`/${orgSlug}/catalog`} />}
        >
          Отмена
        </Button>
      </div>
    </form>
  );
}

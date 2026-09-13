"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardFooter } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { EntityCombobox, type ComboboxOption } from "@/components/forms/entity-combobox";
import { ClientCombobox } from "@/components/forms/client-combobox";
import { createDiscount, type CreateDiscountInput } from "@/actions/discounts";

const TYPE_ITEMS = { PERCENTAGE: "Процент", FIXED_AMOUNT: "Фиксированная сумма" };
const TARGET_ITEMS = {
  ALL: "Все товары",
  CATALOG_GROUP: "Группа товаров",
  CATALOG_ITEM: "Конкретный товар",
  CLIENT: "Конкретный клиент",
};

interface DiscountFormProps {
  orgSlug: string;
  catalogGroupOptions: ComboboxOption[];
  catalogItemOptions: ComboboxOption[];
  clientOptions: ComboboxOption[];
}

export function DiscountForm({ orgSlug, catalogGroupOptions, catalogItemOptions, clientOptions }: DiscountFormProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [type, setType] = useState<CreateDiscountInput["type"]>("PERCENTAGE");
  const [value, setValue] = useState("");
  const [target, setTarget] = useState<CreateDiscountInput["target"]>("ALL");
  const [targetId, setTargetId] = useState<string | null>(null);
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");

  function handleSubmit() {
    setError(null);
    if (!name.trim()) {
      setError("Введите название");
      return;
    }
    if (target !== "ALL" && !targetId) {
      setError("Выберите, на что действует скидка");
      return;
    }

    startTransition(async () => {
      const result = await createDiscount(orgSlug, {
        name,
        type,
        value: Number(value),
        target,
        targetId,
        startDate: startDate || null,
        endDate: endDate || null,
      });
      if (result.error) {
        setError(result.error);
        return;
      }
      router.push(`/${orgSlug}/settings/discounts`);
    });
  }

  return (
    <Card>
      <CardContent className="flex flex-col gap-4">
        <div className="flex flex-col gap-2">
          <Label>Название</Label>
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Скидка постоянным клиентам" required />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="flex flex-col gap-2">
            <Label>Тип</Label>
            <Select items={TYPE_ITEMS} value={type} onValueChange={(v) => v && setType(v as CreateDiscountInput["type"])}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="PERCENTAGE">Процент</SelectItem>
                <SelectItem value="FIXED_AMOUNT">Фиксированная сумма</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-2">
            <Label>Размер {type === "PERCENTAGE" ? "(%)" : "(в валюте товара)"}</Label>
            <Input type="number" min="0" step="0.01" value={value} onChange={(e) => setValue(e.target.value)} required />
          </div>
        </div>
        <div className="flex flex-col gap-2">
          <Label>Действует на</Label>
          <Select
            items={TARGET_ITEMS}
            value={target}
            onValueChange={(v) => {
              if (v) {
                setTarget(v as CreateDiscountInput["target"]);
                setTargetId(null);
              }
            }}
          >
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">Все товары</SelectItem>
              <SelectItem value="CATALOG_GROUP">Группа товаров</SelectItem>
              <SelectItem value="CATALOG_ITEM">Конкретный товар</SelectItem>
              <SelectItem value="CLIENT">Конкретный клиент</SelectItem>
            </SelectContent>
          </Select>
        </div>
        {target === "CATALOG_GROUP" && (
          <EntityCombobox
            options={catalogGroupOptions}
            value={targetId}
            onChange={setTargetId}
            placeholder="Выберите группу"
            emptyMessage="Группы не найдены"
          />
        )}
        {target === "CATALOG_ITEM" && (
          <EntityCombobox
            options={catalogItemOptions}
            value={targetId}
            onChange={setTargetId}
            placeholder="Выберите товар"
            emptyMessage="Товары не найдены"
          />
        )}
        {target === "CLIENT" && (
          <ClientCombobox
            orgSlug={orgSlug}
            options={clientOptions}
            value={targetId}
            onChange={setTargetId}
            placeholder="Выберите клиента"
            emptyMessage="Клиенты не найдены"
            createLabel="клиента"
          />
        )}
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="flex flex-col gap-2">
            <Label>Действует с</Label>
            <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
          </div>
          <div className="flex flex-col gap-2">
            <Label>Действует по</Label>
            <Input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
          </div>
        </div>
        {error && <p className="text-sm text-destructive">{error}</p>}
      </CardContent>
      <CardFooter className="flex gap-2">
        <Button type="button" onClick={handleSubmit} disabled={isPending}>
          {isPending ? "Сохранение..." : "Создать"}
        </Button>
        <Button type="button" variant="outline" onClick={() => router.push(`/${orgSlug}/settings/discounts`)}>
          Отмена
        </Button>
      </CardFooter>
    </Card>
  );
}

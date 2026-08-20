"use client";

import Link from "next/link";
import { useActionState } from "react";
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
import type { ActionResult } from "@/actions/catalog";

const initialState: ActionResult = {};

interface CatalogItemFormProps {
  orgSlug: string;
  action: (prevState: ActionResult, formData: FormData) => Promise<ActionResult>;
  defaultValues?: {
    name: string;
    type: "PRODUCT" | "SERVICE";
    sku: string | null;
    unitPrice: string | number;
    currency: string;
  };
  submitLabel: string;
}

export function CatalogItemForm({
  orgSlug,
  action,
  defaultValues,
  submitLabel,
}: CatalogItemFormProps) {
  const [state, formAction, pending] = useActionState(action, initialState);

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
            <Select name="type" defaultValue={defaultValues?.type ?? "PRODUCT"}>
              <SelectTrigger id="type" className="w-full">
                <SelectValue placeholder="Выберите тип" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="PRODUCT">Товар</SelectItem>
                <SelectItem value="SERVICE">Услуга</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="sku">Артикул</Label>
            <Input id="sku" name="sku" defaultValue={defaultValues?.sku ?? ""} />
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
          </div>
          {state.error && (
            <p className="text-sm text-destructive">{state.error}</p>
          )}
        </CardContent>
        <CardFooter className="flex gap-2">
          <Button type="submit" disabled={pending}>
            {pending ? "Сохранение..." : submitLabel}
          </Button>
          <Button
            variant="outline"
            render={<Link href={`/${orgSlug}/catalog`} />}
          >
            Отмена
          </Button>
        </CardFooter>
      </Card>
    </form>
  );
}

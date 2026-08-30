"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "@/components/ui/table";
import { SimpleDeleteButton } from "@/components/data-table/simple-delete-button";
import { createCatalogVariant, deleteCatalogVariant } from "@/actions/catalog-variants";

interface CharacteristicOption {
  id: string;
  name: string;
}

interface VariantRow {
  id: string;
  label: string;
  sku: string | null;
  barcode: string | null;
  priceOverride: string | null;
}

interface VariantsEditorProps {
  orgSlug: string;
  catalogItemId: string;
  characteristics: CharacteristicOption[];
  variants: VariantRow[];
}

export function VariantsEditor({
  orgSlug,
  catalogItemId,
  characteristics,
  variants,
}: VariantsEditorProps) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [sku, setSku] = useState("");
  const [barcode, setBarcode] = useState("");
  const [priceOverride, setPriceOverride] = useState("");
  const [values, setValues] = useState<Record<string, string>>({});

  function handleAdd() {
    setError(null);
    const valueEntries = Object.entries(values)
      .filter(([, v]) => v.trim().length > 0)
      .map(([characteristicId, value]) => ({ characteristicId, value: value.trim() }));

    if (valueEntries.length === 0) {
      setError("Укажите значение хотя бы одной характеристики");
      return;
    }

    startTransition(async () => {
      const result = await createCatalogVariant(orgSlug, catalogItemId, {
        sku: sku || undefined,
        barcode: barcode || undefined,
        priceOverride: priceOverride ? Number(priceOverride) : undefined,
        values: valueEntries,
      });
      if (result.error) {
        setError(result.error);
        return;
      }
      toast.success("Модификация добавлена");
      setSku("");
      setBarcode("");
      setPriceOverride("");
      setValues({});
    });
  }

  function handleDelete(variantId: string) {
    return () => deleteCatalogVariant(orgSlug, catalogItemId, variantId);
  }

  if (characteristics.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Модификации</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            Сначала добавьте хотя бы одну характеристику (например, «Размер») на вкладке
            «Характеристики» в каталоге.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Модификации</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {variants.length > 0 && (
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Характеристики</TableHead>
                  <TableHead>Артикул</TableHead>
                  <TableHead>Штрихкод</TableHead>
                  <TableHead className="text-right">Цена</TableHead>
                  <TableHead className="w-0" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {variants.map((v) => (
                  <TableRow key={v.id}>
                    <TableCell>{v.label}</TableCell>
                    <TableCell>{v.sku ?? "—"}</TableCell>
                    <TableCell>{v.barcode ?? "—"}</TableCell>
                    <TableCell className="text-right">{v.priceOverride ?? "—"}</TableCell>
                    <TableCell className="text-right">
                      <SimpleDeleteButton
                        onDelete={handleDelete(v.id)}
                        title="Удалить модификацию?"
                        description="Если модификация используется в заказах, удаление будет заблокировано."
                      />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}

        <div className="grid gap-3 sm:grid-cols-2">
          {characteristics.map((c) => (
            <div key={c.id} className="flex flex-col gap-2">
              <Label>{c.name}</Label>
              <Input
                value={values[c.id] ?? ""}
                onChange={(e) => setValues((prev) => ({ ...prev, [c.id]: e.target.value }))}
                placeholder="—"
              />
            </div>
          ))}
        </div>
        <div className="grid gap-3 sm:grid-cols-3">
          <div className="flex flex-col gap-2">
            <Label>Артикул</Label>
            <Input value={sku} onChange={(e) => setSku(e.target.value)} />
          </div>
          <div className="flex flex-col gap-2">
            <Label>Штрихкод</Label>
            <Input value={barcode} onChange={(e) => setBarcode(e.target.value)} />
          </div>
          <div className="flex flex-col gap-2">
            <Label>Цена (если отличается)</Label>
            <Input
              type="number"
              step="0.01"
              min="0"
              value={priceOverride}
              onChange={(e) => setPriceOverride(e.target.value)}
            />
          </div>
        </div>
        {error && <p className="text-sm text-destructive">{error}</p>}
      </CardContent>
      <CardFooter>
        <Button type="button" onClick={handleAdd} disabled={isPending}>
          {isPending ? "Добавляем..." : "Добавить модификацию"}
        </Button>
      </CardFooter>
    </Card>
  );
}

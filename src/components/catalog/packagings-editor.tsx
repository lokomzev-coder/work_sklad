"use client";

import { useRef, useState, useTransition } from "react";
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
import { EntityCombobox, type ComboboxOption } from "@/components/forms/entity-combobox";
import { PackagingTypeCombobox } from "@/components/catalog/packaging-type-combobox";
import { createPackaging, deletePackaging } from "@/actions/catalog-item-packagings";
import { generateBarcode } from "@/actions/catalog";

interface PackagingRow {
  id: string;
  packagingTypeName: string;
  quantity: string;
  unitShortName: string | null;
  barcode: string | null;
}

interface PackagingsEditorProps {
  orgSlug: string;
  catalogItemId: string;
  packagingTypeOptions: ComboboxOption[];
  unitOptions: ComboboxOption[];
  packagings: PackagingRow[];
}

/**
 * Block R — several named packagings per item ("поштучно" + "упаковка по
 * 10 шт" + "рулон 30м"), each with its own quantity/unit/barcode, same
 * table-editor shape as VariantsEditor (src/components/catalog/
 * variants-editor.tsx) — a familiar pattern reused, not a new one.
 */
export function PackagingsEditor({
  orgSlug,
  catalogItemId,
  packagingTypeOptions,
  unitOptions,
  packagings,
}: PackagingsEditorProps) {
  const [isPending, startTransition] = useTransition();
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [packagingTypeId, setPackagingTypeId] = useState<string | null>(null);
  const [quantity, setQuantity] = useState("");
  const [unitId, setUnitId] = useState<string | null>(null);
  const barcodeRef = useRef<HTMLInputElement>(null);

  async function handleGenerateBarcode() {
    setIsGenerating(true);
    try {
      const result = await generateBarcode(orgSlug);
      if ("barcode" in result && barcodeRef.current) {
        barcodeRef.current.value = result.barcode;
      }
    } finally {
      setIsGenerating(false);
    }
  }

  function handleAdd() {
    setError(null);
    if (!packagingTypeId) {
      setError("Выберите вид упаковки");
      return;
    }
    const quantityNum = Number(quantity);
    if (!quantityNum || quantityNum <= 0) {
      setError("Укажите количество больше 0");
      return;
    }

    startTransition(async () => {
      const result = await createPackaging(orgSlug, catalogItemId, {
        packagingTypeId,
        quantity: quantityNum,
        unitId: unitId ?? undefined,
        barcode: barcodeRef.current?.value || undefined,
      });
      if (result.error) {
        setError(result.error);
        return;
      }
      toast.success("Упаковка добавлена");
      setPackagingTypeId(null);
      setQuantity("");
      setUnitId(null);
      if (barcodeRef.current) barcodeRef.current.value = "";
    });
  }

  function handleDelete(packagingId: string) {
    return () => deletePackaging(orgSlug, catalogItemId, packagingId);
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Упаковки</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {packagings.length > 0 && (
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Вид упаковки</TableHead>
                  <TableHead>Количество</TableHead>
                  <TableHead>Штрихкод</TableHead>
                  <TableHead className="w-0" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {packagings.map((p) => (
                  <TableRow key={p.id}>
                    <TableCell>{p.packagingTypeName}</TableCell>
                    <TableCell>
                      {p.quantity}
                      {p.unitShortName ? ` ${p.unitShortName}` : ""}
                    </TableCell>
                    <TableCell>{p.barcode ?? "—"}</TableCell>
                    <TableCell className="text-right">
                      <SimpleDeleteButton
                        onDelete={handleDelete(p.id)}
                        title="Удалить упаковку?"
                        description="Действие необратимо."
                      />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="flex flex-col gap-2">
            <Label>Вид упаковки</Label>
            <PackagingTypeCombobox
              orgSlug={orgSlug}
              options={packagingTypeOptions}
              value={packagingTypeId}
              onChange={setPackagingTypeId}
            />
          </div>
          <div className="flex gap-2">
            <div className="flex flex-1 flex-col gap-2">
              <Label>Количество</Label>
              <Input
                type="number"
                step="0.001"
                min="0"
                value={quantity}
                onChange={(e) => setQuantity(e.target.value)}
                placeholder="Например, 30"
              />
            </div>
            <div className="flex flex-1 flex-col gap-2">
              <Label>Единица</Label>
              <EntityCombobox
                options={unitOptions}
                value={unitId}
                onChange={setUnitId}
                placeholder="—"
                emptyMessage="Единицы не найдены"
              />
            </div>
          </div>
        </div>
        <div className="flex flex-col gap-2">
          <Label>Штрихкод упаковки</Label>
          <div className="flex gap-2">
            <Input ref={barcodeRef} placeholder="Необязательно" />
            <Button type="button" variant="outline" onClick={handleGenerateBarcode} disabled={isGenerating}>
              {isGenerating ? "..." : "Сгенерировать"}
            </Button>
          </div>
        </div>
        {error && <p className="text-sm text-destructive">{error}</p>}
      </CardContent>
      <CardFooter>
        <Button type="button" onClick={handleAdd} disabled={isPending}>
          {isPending ? "Добавляем..." : "Добавить упаковку"}
        </Button>
      </CardFooter>
    </Card>
  );
}

"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardFooter } from "@/components/ui/card";
import { EntityCombobox, type ComboboxOption } from "@/components/forms/entity-combobox";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "@/components/ui/table";
import { postDraftSupply } from "@/actions/fulfillment";

function lineKey(catalogItemId: string, variantId: string | null): string {
  return `${catalogItemId}:${variantId ?? ""}`;
}

export interface DraftSupplyLine {
  catalogItemId: string;
  variantId: string | null;
  name: string;
  quantity: string;
}

interface DraftSupplyEditorProps {
  orgSlug: string;
  movementId: string;
  storeOptions: ComboboxOption[];
  defaultStoreId: string;
  lines: DraftSupplyLine[];
}

/** Renders instead of the read-only lines table for an unposted SUPPLY
 * movement (see (dashboard)/[org]/warehouse/[id]/page.tsx) — "Создать
 * приёмку" creates the draft already redirected here. Same shape as
 * `DraftDemandEditor` plus per-line batch label/expiry (moved here from the
 * old `FulfillmentPanel` "supply" form — a receipt line still needs its
 * cost-basis batch metadata, just entered before posting instead of before
 * creating). */
export function DraftSupplyEditor({
  orgSlug,
  movementId,
  storeOptions,
  defaultStoreId,
  lines,
}: DraftSupplyEditorProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [storeId, setStoreId] = useState<string | null>(defaultStoreId);
  const [quantities, setQuantities] = useState<Record<string, string>>(() =>
    Object.fromEntries(lines.map((l) => [lineKey(l.catalogItemId, l.variantId), l.quantity])),
  );
  const [batchLabels, setBatchLabels] = useState<Record<string, string>>({});
  const [batchExpiryDates, setBatchExpiryDates] = useState<Record<string, string>>({});

  function handlePost() {
    setError(null);
    if (!storeId) {
      setError("Выберите склад");
      return;
    }

    const requestLines = lines.map((l) => {
      const key = lineKey(l.catalogItemId, l.variantId);
      return {
        catalogItemId: l.catalogItemId,
        variantId: l.variantId,
        quantity: Number(quantities[key] || 0),
        batchLabel: batchLabels[key] || undefined,
        batchExpiryDate: batchExpiryDates[key] || undefined,
      };
    });

    startTransition(async () => {
      const result = await postDraftSupply(orgSlug, movementId, { storeId, lines: requestLines });
      if (result.error) {
        setError(result.error);
        return;
      }
      router.refresh();
    });
  }

  return (
    <Card>
      <CardContent className="flex flex-col gap-4">
        <div className="flex flex-col gap-2">
          <Label>Склад</Label>
          <EntityCombobox
            options={storeOptions}
            value={storeId}
            onChange={setStoreId}
            placeholder="Выберите склад"
            emptyMessage="Склады не найдены"
          />
        </div>
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Товар</TableHead>
                <TableHead className="text-right">Количество</TableHead>
                <TableHead>Партия</TableHead>
                <TableHead>Срок годности</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {lines.map((line) => {
                const key = lineKey(line.catalogItemId, line.variantId);
                return (
                  <TableRow key={key}>
                    <TableCell>{line.name}</TableCell>
                    <TableCell className="text-right">
                      <Input
                        type="number"
                        min="0"
                        step="0.001"
                        className="ml-auto w-28"
                        value={quantities[key] ?? ""}
                        onChange={(e) => setQuantities((prev) => ({ ...prev, [key]: e.target.value }))}
                      />
                    </TableCell>
                    <TableCell>
                      <Input
                        type="text"
                        placeholder="Необязательно"
                        className="w-40"
                        value={batchLabels[key] ?? ""}
                        onChange={(e) => setBatchLabels((prev) => ({ ...prev, [key]: e.target.value }))}
                      />
                    </TableCell>
                    <TableCell>
                      <Input
                        type="date"
                        className="w-40"
                        value={batchExpiryDates[key] ?? ""}
                        onChange={(e) => setBatchExpiryDates((prev) => ({ ...prev, [key]: e.target.value }))}
                      />
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
        {error && <p className="text-sm text-destructive">{error}</p>}
      </CardContent>
      <CardFooter>
        <Button type="button" onClick={handlePost} disabled={isPending}>
          {isPending ? "Проводим..." : "Провести"}
        </Button>
      </CardFooter>
    </Card>
  );
}

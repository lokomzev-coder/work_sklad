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
import { postDraftDemand } from "@/actions/fulfillment";

function lineKey(catalogItemId: string, variantId: string | null): string {
  return `${catalogItemId}:${variantId ?? ""}`;
}

export interface DraftDemandLine {
  catalogItemId: string;
  variantId: string | null;
  name: string;
  quantity: string;
  /** Physical balance at the movement's current store minus what other
   * orders have reserved there — a hint only, computed once at page-load
   * time for the draft's current store. The authoritative check happens
   * server-side in `postDraftDemand` regardless (re-validated against
   * whatever store is actually selected when "Провести" is clicked), so a
   * stale hint after changing the store client-side is a cosmetic rough
   * edge, not a correctness gap. */
  available: number;
}

interface DraftDemandEditorProps {
  orgSlug: string;
  movementId: string;
  storeOptions: ComboboxOption[];
  defaultStoreId: string;
  lines: DraftDemandLine[];
}

/** Renders instead of the read-only lines table for an unposted DEMAND
 * movement (see (dashboard)/[org]/warehouse/[id]/page.tsx) — "Создать
 * документ" → "Отгрузка" creates the draft already redirected here; store
 * and per-line quantities are edited on this page, then "Провести" both
 * applies the edits and performs the actual stock deduction in one step
 * (actions/fulfillment.ts::postDraftDemand) — no separate "save draft"
 * step, matching what was actually requested. */
export function DraftDemandEditor({
  orgSlug,
  movementId,
  storeOptions,
  defaultStoreId,
  lines,
}: DraftDemandEditorProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [storeId, setStoreId] = useState<string | null>(defaultStoreId);
  const [quantities, setQuantities] = useState<Record<string, string>>(() =>
    Object.fromEntries(lines.map((l) => [lineKey(l.catalogItemId, l.variantId), l.quantity])),
  );

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
      };
    });

    startTransition(async () => {
      const result = await postDraftDemand(orgSlug, movementId, { storeId, lines: requestLines });
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
                <TableHead className="text-right">Доступно</TableHead>
                <TableHead className="text-right">Количество</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {lines.map((line) => {
                const key = lineKey(line.catalogItemId, line.variantId);
                return (
                  <TableRow key={key}>
                    <TableCell>{line.name}</TableCell>
                    <TableCell className="text-right text-muted-foreground">{line.available}</TableCell>
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

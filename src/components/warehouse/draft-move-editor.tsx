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
import { postDraftMove } from "@/actions/fulfillment";

function lineKey(catalogItemId: string, variantId: string | null): string {
  return `${catalogItemId}:${variantId ?? ""}`;
}

export interface DraftMoveLine {
  catalogItemId: string;
  variantId: string | null;
  name: string;
  quantity: string;
}

interface DraftMoveEditorProps {
  orgSlug: string;
  movementId: string;
  storeOptions: ComboboxOption[];
  defaultStoreId: string;
  lines: DraftMoveLine[];
}

/** Renders instead of the read-only lines table for an unposted MOVE
 * movement (see (dashboard)/[org]/warehouse/[id]/page.tsx) — "Создать
 * документ" → "Перемещение" creates the draft already redirected here.
 * Same shape as `DraftDemandEditor` plus a destination-store field (a MOVE
 * needs both), kept as its own component rather than a shared one with
 * conditionals — the two call different actions with different result
 * shapes and DEMAND additionally shows an "Доступно" hint column that MOVE
 * has no equivalent for. */
export function DraftMoveEditor({
  orgSlug,
  movementId,
  storeOptions,
  defaultStoreId,
  lines,
}: DraftMoveEditorProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [storeId, setStoreId] = useState<string | null>(defaultStoreId);
  const [toStoreId, setToStoreId] = useState<string | null>(null);
  const [quantities, setQuantities] = useState<Record<string, string>>(() =>
    Object.fromEntries(lines.map((l) => [lineKey(l.catalogItemId, l.variantId), l.quantity])),
  );

  function handlePost() {
    setError(null);
    if (!storeId) {
      setError("Выберите склад");
      return;
    }
    if (!toStoreId) {
      setError("Выберите склад назначения");
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
      const result = await postDraftMove(orgSlug, movementId, { storeId, toStoreId, lines: requestLines });
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
          <Label>Склад-источник</Label>
          <EntityCombobox
            options={storeOptions}
            value={storeId}
            onChange={setStoreId}
            placeholder="Выберите склад"
            emptyMessage="Склады не найдены"
          />
        </div>
        <div className="flex flex-col gap-2">
          <Label>Склад назначения</Label>
          <EntityCombobox
            options={storeOptions.filter((o) => o.value !== storeId)}
            value={toStoreId}
            onChange={setToStoreId}
            placeholder="Выберите склад назначения"
            emptyMessage="Склады не найдены"
          />
        </div>
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Товар</TableHead>
                <TableHead className="text-right">Количество</TableHead>
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

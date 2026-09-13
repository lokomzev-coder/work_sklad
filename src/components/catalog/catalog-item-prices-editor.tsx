"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { setCatalogItemPrice } from "@/actions/catalog-item-prices";

export interface PriceTypeRow {
  id: string;
  name: string;
}

interface CatalogItemPricesEditorProps {
  orgSlug: string;
  catalogItemId: string;
  priceTypes: PriceTypeRow[];
  /** priceTypeId -> current value, "" if not set for this item. */
  initialValues: Record<string, string>;
}

/** Block O phase 4 — additional named prices per item (see PriceType's
 * schema comment: informational/API-only, not used by checkout). Blur-to-
 * save, one row per org price type; only rendered at all when the org has
 * at least one price type (see the calling page). */
export function CatalogItemPricesEditor({ orgSlug, catalogItemId, priceTypes, initialValues }: CatalogItemPricesEditorProps) {
  const [isPending, startTransition] = useTransition();
  const [values, setValues] = useState(initialValues);

  function handleBlur(priceTypeId: string) {
    startTransition(async () => {
      const result = await setCatalogItemPrice(orgSlug, catalogItemId, priceTypeId, values[priceTypeId] ?? "");
      if (result.error) toast.error(result.error);
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Цены</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {priceTypes.map((pt) => (
          <div key={pt.id} className="flex items-center gap-3">
            <Label className="w-40 shrink-0">{pt.name}</Label>
            <Input
              type="number"
              min="0"
              step="0.01"
              className="w-32"
              disabled={isPending}
              value={values[pt.id] ?? ""}
              onChange={(e) => setValues((prev) => ({ ...prev, [pt.id]: e.target.value }))}
              onBlur={() => handleBlur(pt.id)}
            />
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

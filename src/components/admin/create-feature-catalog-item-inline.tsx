"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { FeatureCatalogItemForm } from "@/components/admin/feature-catalog-item-form";

export function CreateFeatureCatalogItemInline() {
  const [open, setOpen] = useState(false);

  if (!open) {
    return (
      <Button type="button" variant="outline" size="sm" onClick={() => setOpen(true)}>
        Создать пункт
      </Button>
    );
  }

  return (
    <Card>
      <CardContent className="pt-6">
        <FeatureCatalogItemForm onDone={() => setOpen(false)} />
      </CardContent>
    </Card>
  );
}

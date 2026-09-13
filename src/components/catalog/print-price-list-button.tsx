"use client";

import { Button } from "@/components/ui/button";

/** МойСклад's pricelist as a lightweight generated view (not a stored,
 * numbered document) — see ROADMAP Block O phase 6 for why: low-medium
 * priority, purely derived from PriceType/CatalogItemPrice (phase 4), no
 * business logic of its own to justify a persisted model. */
export function PrintPriceListButton() {
  return (
    <Button type="button" variant="outline" className="print:hidden" onClick={() => window.print()}>
      Печать
    </Button>
  );
}

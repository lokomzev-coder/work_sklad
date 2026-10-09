"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { createInventoryCorrections } from "@/actions/stock-movements";

/**
 * Block W — "Создать документ" from a completed inventory count. One click
 * generates whichever of ENTER (surplus)/LOSS (shortage) the discrepancies
 * actually need — see createInventoryCorrections's own doc comment for why
 * this is the only thing that really moves stock now.
 */
export function InventoryCorrectionsButton({
  orgSlug,
  inventoryId,
}: {
  orgSlug: string;
  inventoryId: string;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  function handleClick() {
    startTransition(async () => {
      const result = await createInventoryCorrections(orgSlug, inventoryId);
      if (result.error) {
        toast.error(result.error);
        return;
      }
      toast.success("Документы по инвентаризации созданы");
      router.refresh();
    });
  }

  return (
    <Button type="button" variant="outline" size="sm" disabled={isPending} onClick={handleClick}>
      {isPending ? "Создаём..." : "Создать документ"}
    </Button>
  );
}

"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { createDraftDemandsForWave } from "@/actions/picking-waves";

interface CreateWaveDemandsButtonProps {
  orgSlug: string;
  waveId: string;
}

/** "Создать отгрузки" on a wave's own page — unlike every single-order
 * "Создать документ" action, this one has no single place to redirect to
 * (it creates 0..N draft movements, one per order still needing one), so
 * it reports a summary toast and refreshes the current page instead. */
export function CreateWaveDemandsButton({ orgSlug, waveId }: CreateWaveDemandsButtonProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  function handleClick() {
    startTransition(async () => {
      try {
        const result = await createDraftDemandsForWave(orgSlug, waveId);
        if (result.error) {
          toast.error(result.error);
          return;
        }
        toast.success(`Создано отгрузок: ${result.created}, пропущено: ${result.skipped}`);
        router.refresh();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Не удалось создать отгрузки");
      }
    });
  }

  return (
    <Button type="button" onClick={handleClick} disabled={isPending}>
      {isPending ? "Создаём..." : "Создать отгрузки"}
    </Button>
  );
}

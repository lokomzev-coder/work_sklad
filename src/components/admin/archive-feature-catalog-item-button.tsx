"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { setFeatureCatalogItemStatus } from "@/actions/platform-feature-catalog";

export function ArchiveFeatureCatalogItemButton({ id, status }: { id: string; status: "ACTIVE" | "ARCHIVED" }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  function handleClick() {
    startTransition(async () => {
      const nextStatus = status === "ACTIVE" ? "ARCHIVED" : "ACTIVE";
      const result = await setFeatureCatalogItemStatus(id, nextStatus);
      if (result.error) {
        toast.error(result.error);
        return;
      }
      toast.success(status === "ACTIVE" ? "Пункт архивирован" : "Пункт снова активен");
      router.refresh();
    });
  }

  return (
    <Button type="button" variant="ghost" size="sm" disabled={isPending} onClick={handleClick}>
      {status === "ACTIVE" ? "Архивировать" : "Восстановить"}
    </Button>
  );
}

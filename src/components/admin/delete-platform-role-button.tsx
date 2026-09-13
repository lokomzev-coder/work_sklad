"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { deletePlatformRole } from "@/actions/platform-roles";

export function DeletePlatformRoleButton({ id, adminBasePath }: { id: string; adminBasePath: string }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  function handleClick() {
    startTransition(async () => {
      const result = await deletePlatformRole(id);
      if (result.error) {
        toast.error(result.error);
        return;
      }
      toast.success("Роль удалена");
      router.push(`${adminBasePath}/roles`);
    });
  }

  return (
    <Button type="button" variant="ghost" size="sm" disabled={isPending} onClick={handleClick}>
      Удалить
    </Button>
  );
}

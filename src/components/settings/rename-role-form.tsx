"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { renameCustomRole } from "@/actions/custom-roles";

export function RenameRoleForm({
  orgSlug,
  roleId,
  currentName,
}: {
  orgSlug: string;
  roleId: string;
  currentName: string;
}) {
  const [name, setName] = useState(currentName);
  const [isPending, startTransition] = useTransition();

  function handleRename() {
    if (!name.trim() || name.trim() === currentName) return;
    startTransition(async () => {
      const result = await renameCustomRole(orgSlug, roleId, name.trim());
      if (result.error) {
        toast.error(result.error);
      } else {
        toast.success("Название обновлено");
      }
    });
  }

  return (
    <div className="flex max-w-sm items-end gap-2">
      <div className="flex flex-1 flex-col gap-2">
        <Input value={name} onChange={(e) => setName(e.target.value)} />
      </div>
      <Button
        type="button"
        variant="outline"
        disabled={isPending || !name.trim() || name.trim() === currentName}
        onClick={handleRename}
      >
        Переименовать
      </Button>
    </div>
  );
}

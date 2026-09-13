"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { createPlatformRole, updatePlatformRole } from "@/actions/platform-roles";
import type { PlatformCapability } from "@/lib/platform-auth";

const CAPABILITY_LABELS: Record<PlatformCapability, string> = {
  viewOrganizations: "Просмотр организаций",
  manageSubscriptions: "Управление подписками",
  manageAdmins: "Управление администраторами и ролями",
  viewAuditLog: "Просмотр журнала аудита",
};

interface PlatformRoleFormProps {
  capabilities: PlatformCapability[];
  role?: { id: string; name: string; permissions: Record<string, boolean> };
  onDone?: () => void;
}

export function PlatformRoleForm({ capabilities, role, onDone }: PlatformRoleFormProps) {
  const router = useRouter();
  const [name, setName] = useState(role?.name ?? "");
  const [granted, setGranted] = useState<Set<PlatformCapability>>(
    () => new Set(capabilities.filter((c) => role?.permissions?.[c] === true)),
  );
  const [isPending, startTransition] = useTransition();

  function toggle(capability: PlatformCapability, checked: boolean) {
    setGranted((prev) => {
      const next = new Set(prev);
      if (checked) next.add(capability);
      else next.delete(capability);
      return next;
    });
  }

  function handleSubmit() {
    const permissions = Object.fromEntries(capabilities.map((c) => [c, granted.has(c)]));
    startTransition(async () => {
      const result = role
        ? await updatePlatformRole(role.id, name, permissions)
        : await createPlatformRole(name, permissions);
      if (result.error) {
        toast.error(result.error);
        return;
      }
      toast.success(role ? "Роль обновлена" : "Роль создана");
      router.refresh();
      onDone?.();
    });
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <Label htmlFor="role-name">Название роли</Label>
        <Input id="role-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Например, Поддержка" />
      </div>
      <div className="flex flex-col gap-2">
        <Label>Права</Label>
        {capabilities.map((capability) => (
          <label key={capability} className="flex items-center gap-2 text-sm">
            <Checkbox
              checked={granted.has(capability)}
              onCheckedChange={(checked) => toggle(capability, checked === true)}
            />
            {CAPABILITY_LABELS[capability]}
          </label>
        ))}
      </div>
      <Button type="button" onClick={handleSubmit} disabled={isPending || !name.trim()}>
        {isPending ? "Сохраняем..." : role ? "Сохранить" : "Создать роль"}
      </Button>
    </div>
  );
}

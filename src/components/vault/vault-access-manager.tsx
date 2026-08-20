"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { EntityCombobox, type ComboboxOption } from "@/components/forms/entity-combobox";
import { grantVaultAccess, revokeVaultAccess } from "@/actions/vault";

interface VaultAccessManagerProps {
  orgSlug: string;
  entryId: string;
  grantedEmployees: { id: string; fullName: string }[];
  availableEmployees: ComboboxOption[];
}

export function VaultAccessManager({
  orgSlug,
  entryId,
  grantedEmployees,
  availableEmployees,
}: VaultAccessManagerProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [selected, setSelected] = useState<string | null>(null);

  function handleGrant() {
    if (!selected) return;
    const employeeId = selected;
    startTransition(async () => {
      await grantVaultAccess(orgSlug, entryId, employeeId);
      setSelected(null);
      router.refresh();
    });
  }

  function handleRevoke(employeeId: string) {
    startTransition(async () => {
      await revokeVaultAccess(orgSlug, entryId, employeeId);
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap gap-2">
        {grantedEmployees.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Доступ никому не выдан
          </p>
        ) : (
          grantedEmployees.map((employee) => (
            <Badge key={employee.id} variant="secondary" className="gap-1 pr-1">
              {employee.fullName}
              <button
                type="button"
                onClick={() => handleRevoke(employee.id)}
                disabled={isPending}
                className="ml-1 rounded-full p-0.5 text-muted-foreground hover:bg-background hover:text-foreground"
                aria-label={`Отозвать доступ у ${employee.fullName}`}
              >
                <X className="size-3" />
              </button>
            </Badge>
          ))
        )}
      </div>
      <div className="flex items-center gap-2">
        <EntityCombobox
          options={availableEmployees}
          value={selected}
          onChange={setSelected}
          placeholder="Выберите сотрудника"
          emptyMessage="Все сотрудники уже имеют доступ"
          className="w-64"
        />
        <Button
          type="button"
          size="sm"
          onClick={handleGrant}
          disabled={!selected || isPending}
        >
          Выдать доступ
        </Button>
      </div>
    </div>
  );
}

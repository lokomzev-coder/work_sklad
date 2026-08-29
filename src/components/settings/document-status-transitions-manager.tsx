"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "@/components/ui/table";
import { createStatusTransition, deleteStatusTransition } from "@/actions/document-status-transitions";
import type { Role, DocumentStatusKind } from "@/generated/prisma/enums";

interface StatusOption {
  id: string;
  name: string;
}

interface TransitionRow {
  id: string;
  fromStatusId: string;
  toStatusId: string;
  allowedRoles: Role[];
}

const ROLES: Role[] = ["ADMIN", "MANAGER", "EMPLOYEE"];
const ROLE_LABEL: Record<Role, string> = {
  ADMIN: "Админ",
  MANAGER: "Менеджер",
  EMPLOYEE: "Сотрудник",
};

export function DocumentStatusTransitionsManager({
  orgSlug,
  kind,
  statuses,
  transitions,
}: {
  orgSlug: string;
  kind: DocumentStatusKind;
  statuses: StatusOption[];
  transitions: TransitionRow[];
}) {
  const [isPending, startTransition] = useTransition();
  const [fromStatusId, setFromStatusId] = useState("");
  const [toStatusId, setToStatusId] = useState("");
  const [roles, setRoles] = useState<Role[]>([]);

  const nameById = Object.fromEntries(statuses.map((s) => [s.id, s.name]));

  function toggleRole(role: Role, checked: boolean) {
    setRoles((prev) => (checked ? [...prev, role] : prev.filter((r) => r !== role)));
  }

  function handleCreate() {
    if (!fromStatusId || !toStatusId) return;
    startTransition(async () => {
      const result = await createStatusTransition(orgSlug, fromStatusId, toStatusId, roles);
      if (result.error) {
        toast.error(result.error);
      } else {
        setFromStatusId("");
        setToStatusId("");
        setRoles([]);
      }
    });
  }

  function handleDelete(id: string) {
    startTransition(async () => {
      await deleteStatusTransition(orgSlug, id);
      toast.success("Переход удалён");
    });
  }

  const restrictedFromIds = new Set(transitions.map((t) => t.fromStatusId));

  return (
    <div className="flex flex-col gap-2">
      <p className="text-sm text-muted-foreground">
        Без единого добавленного правила разрешён переход из любого статуса в любой. Как только для
        статуса добавлено хотя бы одно правило — из него можно двигаться только по явно разрешённым
        переходам. Пусто в «Роли» — доступно всем, у кого вообще есть право менять статус.
      </p>
      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Из</TableHead>
              <TableHead>В</TableHead>
              <TableHead>Роли</TableHead>
              <TableHead className="w-0" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {transitions.map((t) => (
              <TableRow key={t.id}>
                <TableCell>{nameById[t.fromStatusId] ?? "—"}</TableCell>
                <TableCell>{nameById[t.toStatusId] ?? "—"}</TableCell>
                <TableCell className="text-muted-foreground">
                  {t.allowedRoles.length === 0
                    ? "Все"
                    : t.allowedRoles.map((r) => ROLE_LABEL[r]).join(", ")}
                </TableCell>
                <TableCell className="text-right">
                  <Button type="button" variant="ghost" size="sm" disabled={isPending} onClick={() => handleDelete(t.id)}>
                    <X className="size-4" />
                  </Button>
                </TableCell>
              </TableRow>
            ))}
            <TableRow>
              <TableCell>
                <select
                  className="h-8 rounded-md border bg-background px-2 text-sm"
                  value={fromStatusId}
                  onChange={(e) => setFromStatusId(e.target.value)}
                >
                  <option value="">Из статуса...</option>
                  {statuses.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                      {restrictedFromIds.has(s.id) ? " (ограничен)" : ""}
                    </option>
                  ))}
                </select>
              </TableCell>
              <TableCell>
                <select
                  className="h-8 rounded-md border bg-background px-2 text-sm"
                  value={toStatusId}
                  onChange={(e) => setToStatusId(e.target.value)}
                >
                  <option value="">В статус...</option>
                  {statuses.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </TableCell>
              <TableCell>
                <div className="flex flex-wrap gap-2">
                  {ROLES.map((role) => (
                    <label key={role} className="flex items-center gap-1 text-xs">
                      <Checkbox
                        checked={roles.includes(role)}
                        onCheckedChange={(checked) => toggleRole(role, checked === true)}
                      />
                      {ROLE_LABEL[role]}
                    </label>
                  ))}
                </div>
              </TableCell>
              <TableCell className="text-right">
                <Button
                  type="button"
                  size="sm"
                  disabled={isPending || !fromStatusId || !toStatusId}
                  onClick={handleCreate}
                >
                  Добавить
                </Button>
              </TableCell>
            </TableRow>
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

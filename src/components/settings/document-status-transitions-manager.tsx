"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
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

interface NamedOption {
  id: string;
  name: string;
}

interface TransitionRow {
  id: string;
  fromStatusId: string;
  toStatusId: string;
  allowedRoles: Role[];
  allowedCustomRoleIds: string[];
  allowedEmployeeIds: string[];
}

const ROLES: Role[] = ["ADMIN", "MANAGER", "EMPLOYEE", "PRODUCTION"];
const ROLE_LABEL: Record<Role, string> = {
  ADMIN: "Админ",
  MANAGER: "Менеджер",
  EMPLOYEE: "Сотрудник",
  PRODUCTION: "Производство",
};

export function DocumentStatusTransitionsManager({
  orgSlug,
  kind,
  statuses,
  transitions,
  customRoles,
  employees,
}: {
  orgSlug: string;
  kind: DocumentStatusKind;
  statuses: StatusOption[];
  transitions: TransitionRow[];
  customRoles: NamedOption[];
  employees: NamedOption[];
}) {
  const [isPending, startTransition] = useTransition();
  const [fromStatusId, setFromStatusId] = useState("");
  const [toStatusId, setToStatusId] = useState("");
  const [roles, setRoles] = useState<Role[]>([]);
  const [customRoleIds, setCustomRoleIds] = useState<string[]>([]);
  const [employeeIds, setEmployeeIds] = useState<string[]>([]);

  const nameById = Object.fromEntries(statuses.map((s) => [s.id, s.name]));
  const customRoleNameById = Object.fromEntries(customRoles.map((r) => [r.id, r.name]));
  const employeeNameById = Object.fromEntries(employees.map((e) => [e.id, e.name]));

  function toggleRole(role: Role, checked: boolean) {
    setRoles((prev) => (checked ? [...prev, role] : prev.filter((r) => r !== role)));
  }

  function toggleId(list: string[], setList: (v: string[]) => void, id: string, checked: boolean) {
    setList(checked ? [...list, id] : list.filter((i) => i !== id));
  }

  function handleCreate() {
    if (!fromStatusId || !toStatusId) return;
    startTransition(async () => {
      const result = await createStatusTransition(
        orgSlug,
        fromStatusId,
        toStatusId,
        roles,
        customRoleIds,
        employeeIds,
      );
      if (result.error) {
        toast.error(result.error);
      } else {
        setFromStatusId("");
        setToStatusId("");
        setRoles([]);
        setCustomRoleIds([]);
        setEmployeeIds([]);
      }
    });
  }

  function whoLabel(t: TransitionRow): string {
    const parts = [
      ...t.allowedRoles.map((r) => ROLE_LABEL[r]),
      ...t.allowedCustomRoleIds.map((id) => customRoleNameById[id] ?? "—"),
      ...t.allowedEmployeeIds.map((id) => employeeNameById[id] ?? "—"),
    ];
    return parts.length === 0 ? "Все" : parts.join(", ");
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
        переходам. Пусто в «Кому разрешено» — доступно всем, у кого вообще есть право менять статус;
        отметка по роли, пользовательской роли и/или конкретному сотруднику сужает круг — достаточно
        совпадения по любому одному из трёх.
      </p>
      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Из</TableHead>
              <TableHead>В</TableHead>
              <TableHead>Кому разрешено</TableHead>
              <TableHead className="w-0" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {transitions.map((t) => (
              <TableRow key={t.id}>
                <TableCell>{nameById[t.fromStatusId] ?? "—"}</TableCell>
                <TableCell>{nameById[t.toStatusId] ?? "—"}</TableCell>
                <TableCell className="text-muted-foreground">{whoLabel(t)}</TableCell>
                <TableCell className="text-right">
                  <Button type="button" variant="ghost" size="sm" disabled={isPending} onClick={() => handleDelete(t.id)}>
                    <X className="size-4" />
                  </Button>
                </TableCell>
              </TableRow>
            ))}
            <TableRow>
              <TableCell>
                <Select value={fromStatusId} items={nameById} onValueChange={(v) => setFromStatusId(v ?? "")}>
                  <SelectTrigger className="h-8 w-full">
                    <SelectValue placeholder="Из статуса..." />
                  </SelectTrigger>
                  <SelectContent>
                    {statuses.map((s) => (
                      <SelectItem key={s.id} value={s.id}>
                        {s.name}
                        {restrictedFromIds.has(s.id) ? " (ограничен)" : ""}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </TableCell>
              <TableCell>
                <Select value={toStatusId} items={nameById} onValueChange={(v) => setToStatusId(v ?? "")}>
                  <SelectTrigger className="h-8 w-full">
                    <SelectValue placeholder="В статус..." />
                  </SelectTrigger>
                  <SelectContent>
                    {statuses.map((s) => (
                      <SelectItem key={s.id} value={s.id}>
                        {s.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </TableCell>
              <TableCell>
                <div className="flex flex-col gap-1.5">
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
                  {customRoles.length > 0 && (
                    <div className="flex flex-wrap gap-2">
                      {customRoles.map((r) => (
                        <label key={r.id} className="flex items-center gap-1 text-xs">
                          <Checkbox
                            checked={customRoleIds.includes(r.id)}
                            onCheckedChange={(checked) =>
                              toggleId(customRoleIds, setCustomRoleIds, r.id, checked === true)
                            }
                          />
                          {r.name}
                        </label>
                      ))}
                    </div>
                  )}
                  {employees.length > 0 && (
                    <div className="flex flex-wrap gap-2">
                      {employees.map((e) => (
                        <label key={e.id} className="flex items-center gap-1 text-xs">
                          <Checkbox
                            checked={employeeIds.includes(e.id)}
                            onCheckedChange={(checked) =>
                              toggleId(employeeIds, setEmployeeIds, e.id, checked === true)
                            }
                          />
                          {e.name}
                        </label>
                      ))}
                    </div>
                  )}
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

"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
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
import { PERMISSION_GROUPS } from "@/lib/permission-groups";
import { SCOPED_RESOURCES, NON_OVERRIDABLE_RESOURCES, type Resource, type ResourcePermission, type ScopeLevel } from "@/lib/permissions";

const SCOPE_LABELS: Record<ScopeLevel, string> = {
  NONE: "Нет",
  OWN: "Свои",
  OWN_GROUP: "Свои и отдела",
  ALL: "Все",
};

/** Every CustomRole saved through this editor is fully specified (all 22
 * resources), not sparse — see the component's own module doc below for why. */
export type FullResourceMap = Record<Resource, ResourcePermission>;

interface PermissionsMatrixEditorProps {
  /** Currently effective permissions to seed the form with — for a role
   * being edited, its own saved values merged onto the actor's ceiling for
   * anything not yet set; for a fresh role, just the ceiling. */
  initial: FullResourceMap;
  /** The acting admin's OWN resolved capabilities — the matrix never lets
   * you grant a scope/action ranked above what you yourself have, mirroring
   * the server-side delegation-ceiling check (defense in depth, not the
   * only enforcement). */
  ceiling: FullResourceMap;
  onSave: (resources: FullResourceMap) => Promise<{ error?: string }>;
}

const SCOPE_RANK: Record<ScopeLevel, number> = { NONE: 0, OWN: 1, OWN_GROUP: 2, ALL: 3 };

export function PermissionsMatrixEditor({ initial, ceiling, onSave }: PermissionsMatrixEditorProps) {
  const [resources, setResources] = useState<FullResourceMap>(initial);
  const [isPending, startTransition] = useTransition();

  function updateResource(key: Resource, patch: Partial<ResourcePermission>) {
    setResources((prev) => ({ ...prev, [key]: { ...prev[key], ...patch } }));
  }

  function handleSave() {
    startTransition(async () => {
      const result = await onSave(resources);
      if (result.error) {
        toast.error(result.error);
      } else {
        toast.success("Права сохранены");
      }
    });
  }

  return (
    <div className="flex flex-col gap-6">
      {PERMISSION_GROUPS.map((group) => (
        <div key={group.label} className="flex flex-col gap-2">
          <h3 className="text-sm font-semibold text-muted-foreground">{group.label}</h3>
          <div className="rounded-md border">
            <Table className="table-fixed">
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[38%]">Ресурс</TableHead>
                  <TableHead className="w-[18%]">Просмотр</TableHead>
                  <TableHead className="w-[13%] text-center">Создание</TableHead>
                  <TableHead className="w-[18%]">Редактирование</TableHead>
                  <TableHead className="w-[13%] text-center">Удаление</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {group.resources.map(({ key, label }) => {
                  const perm = resources[key];
                  const cap = ceiling[key];
                  const locked = NON_OVERRIDABLE_RESOURCES.has(key);
                  const scoped = SCOPED_RESOURCES.has(key);
                  const scopeOptions: ScopeLevel[] = scoped
                    ? (["NONE", "OWN", "OWN_GROUP", "ALL"] as const).filter((s) => SCOPE_RANK[s] <= SCOPE_RANK[cap.view])
                    : (["NONE", "ALL"] as const).filter((s) => SCOPE_RANK[s] <= SCOPE_RANK[cap.view]);
                  const editScopeOptions: ScopeLevel[] = scoped
                    ? (["NONE", "OWN", "OWN_GROUP", "ALL"] as const).filter((s) => SCOPE_RANK[s] <= SCOPE_RANK[cap.edit])
                    : (["NONE", "ALL"] as const).filter((s) => SCOPE_RANK[s] <= SCOPE_RANK[cap.edit]);

                  return (
                    <TableRow key={key}>
                      <TableCell className="whitespace-normal font-medium">
                        {label}
                        {locked && <p className="text-xs font-normal text-muted-foreground">по базовой роли</p>}
                      </TableCell>
                      <TableCell>
                        {locked ? (
                          <span className="text-sm text-muted-foreground">{SCOPE_LABELS[perm.view]}</span>
                        ) : (
                          <Select value={perm.view} items={SCOPE_LABELS} onValueChange={(v) => updateResource(key, { view: v as ScopeLevel })}>
                            <SelectTrigger className="h-8 w-full">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {scopeOptions.map((s) => (
                                <SelectItem key={s} value={s}>
                                  {SCOPE_LABELS[s]}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        )}
                      </TableCell>
                      <TableCell className="text-center">
                        {locked ? (
                          <span className="text-sm text-muted-foreground">{perm.create ? "Да" : "Нет"}</span>
                        ) : (
                          <Checkbox
                            checked={perm.create}
                            disabled={!cap.create}
                            onCheckedChange={(checked) => updateResource(key, { create: checked === true })}
                          />
                        )}
                      </TableCell>
                      <TableCell>
                        {locked ? (
                          <span className="text-sm text-muted-foreground">{SCOPE_LABELS[perm.edit]}</span>
                        ) : (
                          <Select value={perm.edit} items={SCOPE_LABELS} onValueChange={(v) => updateResource(key, { edit: v as ScopeLevel })}>
                            <SelectTrigger className="h-8 w-full">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {editScopeOptions.map((s) => (
                                <SelectItem key={s} value={s}>
                                  {SCOPE_LABELS[s]}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        )}
                      </TableCell>
                      <TableCell className="text-center">
                        {locked ? (
                          <span className="text-sm text-muted-foreground">{perm.delete ? "Да" : "Нет"}</span>
                        ) : (
                          <Checkbox
                            checked={perm.delete}
                            disabled={!cap.delete}
                            onCheckedChange={(checked) => updateResource(key, { delete: checked === true })}
                          />
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        </div>
      ))}
      <div>
        <Button type="button" onClick={handleSave} disabled={isPending}>
          {isPending ? "Сохранение..." : "Сохранить права"}
        </Button>
      </div>
    </div>
  );
}

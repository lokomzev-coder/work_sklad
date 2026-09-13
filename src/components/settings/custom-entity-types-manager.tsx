"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { SimpleDeleteButton } from "@/components/data-table/simple-delete-button";
import {
  createCustomEntityType,
  deleteCustomEntityType,
  createCustomEntityValue,
  deleteCustomEntityValue,
} from "@/actions/custom-entity-types";

export interface CustomEntityTypeRow {
  id: string;
  name: string;
  values: { id: string; name: string }[];
}

function ValueList({ orgSlug, typeId, values }: { orgSlug: string; typeId: string; values: { id: string; name: string }[] }) {
  const [isPending, startTransition] = useTransition();
  const [newValue, setNewValue] = useState("");

  function handleAdd() {
    if (!newValue.trim()) return;
    startTransition(async () => {
      const result = await createCustomEntityValue(orgSlug, typeId, newValue.trim());
      if (result.error) toast.error(result.error);
      else setNewValue("");
    });
  }

  return (
    <div className="flex flex-col gap-2 pl-4">
      <div className="flex flex-wrap gap-2">
        {values.length === 0 && <span className="text-sm text-muted-foreground">Значений пока нет</span>}
        {values.map((v) => (
          <Badge key={v.id} variant="secondary" className="gap-1 pr-1">
            {v.name}
            <button
              type="button"
              className="ml-1 text-muted-foreground hover:text-destructive"
              disabled={isPending}
              onClick={() =>
                startTransition(async () => {
                  const result = await deleteCustomEntityValue(orgSlug, v.id);
                  if (result.error) toast.error(result.error);
                })
              }
            >
              ×
            </button>
          </Badge>
        ))}
      </div>
      <div className="flex gap-2">
        <Input
          placeholder="Новое значение"
          className="h-8 max-w-xs"
          value={newValue}
          onChange={(e) => setNewValue(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleAdd()}
        />
        <Button type="button" size="sm" variant="outline" disabled={isPending || !newValue.trim()} onClick={handleAdd}>
          Добавить значение
        </Button>
      </div>
    </div>
  );
}

/** Block O phase 5 (МойСклад's customentity) — a reusable dictionary that can
 * back a CUSTOM_ENTITY custom field on several entity types at once (see
 * Настройки → Доп. поля), unlike a SELECT field's one-off option list. */
export function CustomEntityTypesManager({ orgSlug, types }: { orgSlug: string; types: CustomEntityTypeRow[] }) {
  const [isPending, startTransition] = useTransition();
  const [name, setName] = useState("");

  function handleCreate() {
    if (!name.trim()) return;
    startTransition(async () => {
      const result = await createCustomEntityType(orgSlug, name.trim());
      if (result.error) toast.error(result.error);
      else setName("");
    });
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex gap-2">
        <Input
          placeholder="Название справочника (например, «Бренды»)"
          className="max-w-sm"
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleCreate()}
        />
        <Button type="button" disabled={isPending || !name.trim()} onClick={handleCreate}>
          Создать справочник
        </Button>
      </div>

      {types.length === 0 ? (
        <p className="text-sm text-muted-foreground">Справочников ещё нет</p>
      ) : (
        types.map((t) => (
          <Card key={t.id}>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="text-base">{t.name}</CardTitle>
              <SimpleDeleteButton
                onDelete={deleteCustomEntityType.bind(null, orgSlug, t.id)}
                title="Удалить справочник?"
                description="Возможно только если он нигде не используется в доп. полях."
              />
            </CardHeader>
            <CardContent>
              <ValueList orgSlug={orgSlug} typeId={t.id} values={t.values} />
            </CardContent>
          </Card>
        ))
      )}
    </div>
  );
}

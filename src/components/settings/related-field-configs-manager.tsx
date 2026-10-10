"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "@/components/ui/table";
import { createRelatedFieldConfig, deleteRelatedFieldConfig } from "@/actions/related-fields";
import { CLIENT_BUILTIN_FIELDS, type RelatedFieldDef } from "@/lib/related-fields-shared";
import type { RelatedFieldDocumentType, RelatedFieldSourceKind } from "@/generated/prisma/enums";

const SOURCE_KIND_LABELS: Record<RelatedFieldSourceKind, string> = {
  BUILTIN: "Поле клиента",
  CUSTOM: "Доп. поле",
};

export function RelatedFieldConfigsManager({
  orgSlug,
  documentType,
  configs,
  clientCustomFieldDefs,
}: {
  orgSlug: string;
  documentType: RelatedFieldDocumentType;
  configs: RelatedFieldDef[];
  clientCustomFieldDefs: { id: string; name: string }[];
}) {
  const [isPending, startTransition] = useTransition();
  const [sourceKind, setSourceKind] = useState<RelatedFieldSourceKind>("BUILTIN");
  const [fieldKey, setFieldKey] = useState("");
  const [customFieldDefinitionId, setCustomFieldDefinitionId] = useState("");

  const usedBuiltinKeys = new Set(configs.filter((c) => c.sourceKind === "BUILTIN").map((c) => c.fieldKey));
  const usedCustomDefIds = new Set(
    configs.filter((c) => c.sourceKind === "CUSTOM").map((c) => c.customFieldDefinitionId),
  );
  const availableBuiltinFields = CLIENT_BUILTIN_FIELDS.filter((f) => !usedBuiltinKeys.has(f.key));
  const availableCustomDefs = clientCustomFieldDefs.filter((d) => !usedCustomDefIds.has(d.id));

  function handleCreate() {
    const formData = new FormData();
    formData.set("sourceKind", sourceKind);
    if (sourceKind === "BUILTIN") formData.set("fieldKey", fieldKey);
    else formData.set("customFieldDefinitionId", customFieldDefinitionId);
    startTransition(async () => {
      const result = await createRelatedFieldConfig(orgSlug, documentType, {}, formData);
      if (result.error) {
        toast.error(result.error);
      } else {
        setFieldKey("");
        setCustomFieldDefinitionId("");
      }
    });
  }

  function handleDelete(id: string) {
    startTransition(async () => {
      await deleteRelatedFieldConfig(orgSlug, id);
      toast.success("Поле удалено");
    });
  }

  const canCreate = sourceKind === "BUILTIN" ? !!fieldKey : !!customFieldDefinitionId;

  return (
    <div className="rounded-md border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Поле</TableHead>
            <TableHead>Источник</TableHead>
            <TableHead className="w-0" />
          </TableRow>
        </TableHeader>
        <TableBody>
          {configs.map((config) => (
            <TableRow key={config.id}>
              <TableCell className="font-medium">{config.label}</TableCell>
              <TableCell className="text-muted-foreground">{SOURCE_KIND_LABELS[config.sourceKind]}</TableCell>
              <TableCell className="text-right">
                <Button type="button" variant="ghost" size="sm" disabled={isPending} onClick={() => handleDelete(config.id)}>
                  <X className="size-4" />
                </Button>
              </TableCell>
            </TableRow>
          ))}
          <TableRow>
            <TableCell>
              {sourceKind === "BUILTIN" ? (
                availableBuiltinFields.length === 0 ? (
                  <span className="text-xs text-muted-foreground">Все поля уже добавлены</span>
                ) : (
                  <Select
                    value={fieldKey}
                    items={Object.fromEntries(availableBuiltinFields.map((f) => [f.key, f.label]))}
                    onValueChange={(v) => setFieldKey(v ?? "")}
                  >
                    <SelectTrigger className="h-8 w-full">
                      <SelectValue placeholder="Выберите поле" />
                    </SelectTrigger>
                    <SelectContent>
                      {availableBuiltinFields.map((f) => (
                        <SelectItem key={f.key} value={f.key}>
                          {f.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )
              ) : availableCustomDefs.length === 0 ? (
                <span className="text-xs text-muted-foreground">
                  Сначала создайте доп. поле клиента на вкладке «Доп. поля»
                </span>
              ) : (
                <Select
                  value={customFieldDefinitionId}
                  items={Object.fromEntries(availableCustomDefs.map((d) => [d.id, d.name]))}
                  onValueChange={(v) => setCustomFieldDefinitionId(v ?? "")}
                >
                  <SelectTrigger className="h-8 w-full">
                    <SelectValue placeholder="Выберите поле" />
                  </SelectTrigger>
                  <SelectContent>
                    {availableCustomDefs.map((d) => (
                      <SelectItem key={d.id} value={d.id}>
                        {d.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </TableCell>
            <TableCell>
              <Select
                value={sourceKind}
                items={SOURCE_KIND_LABELS}
                onValueChange={(v) => {
                  setSourceKind(v as RelatedFieldSourceKind);
                  setFieldKey("");
                  setCustomFieldDefinitionId("");
                }}
              >
                <SelectTrigger className="h-8 w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(SOURCE_KIND_LABELS).map(([value, label]) => (
                    <SelectItem key={value} value={value}>
                      {label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </TableCell>
            <TableCell className="text-right">
              <Button type="button" size="sm" disabled={isPending || !canCreate} onClick={handleCreate}>
                Добавить
              </Button>
            </TableCell>
          </TableRow>
        </TableBody>
      </Table>
    </div>
  );
}

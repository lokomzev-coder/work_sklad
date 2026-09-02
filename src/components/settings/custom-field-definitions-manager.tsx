"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "@/components/ui/table";
import { createCustomFieldDefinition, deleteCustomFieldDefinition } from "@/actions/custom-fields";
import type { CustomFieldEntityType, CustomFieldType } from "@/generated/prisma/enums";

interface Def {
  id: string;
  name: string;
  type: CustomFieldType;
  options: string[];
}

const TYPE_LABELS: Record<CustomFieldType, string> = {
  TEXT: "Текст",
  NUMBER: "Число",
  DATE: "Дата",
  BOOLEAN: "Да/нет",
  SELECT: "Список",
};

export function CustomFieldDefinitionsManager({
  orgSlug,
  entityType,
  defs,
}: {
  orgSlug: string;
  entityType: CustomFieldEntityType;
  defs: Def[];
}) {
  const [isPending, startTransition] = useTransition();
  const [name, setName] = useState("");
  const [type, setType] = useState<CustomFieldType>("TEXT");
  const [options, setOptions] = useState("");

  function handleCreate() {
    if (!name.trim()) return;
    const formData = new FormData();
    formData.set("name", name.trim());
    formData.set("type", type);
    formData.set("options", options);
    startTransition(async () => {
      const result = await createCustomFieldDefinition(orgSlug, entityType, {}, formData);
      if (result.error) {
        toast.error(result.error);
      } else {
        setName("");
        setOptions("");
      }
    });
  }

  function handleDelete(id: string) {
    startTransition(async () => {
      await deleteCustomFieldDefinition(orgSlug, id);
      toast.success("Поле удалено");
    });
  }

  return (
    <div className="rounded-md border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Название</TableHead>
            <TableHead>Тип</TableHead>
            <TableHead>Варианты</TableHead>
            <TableHead className="w-0" />
          </TableRow>
        </TableHeader>
        <TableBody>
          {defs.map((def) => (
            <TableRow key={def.id}>
              <TableCell className="font-medium">{def.name}</TableCell>
              <TableCell>{TYPE_LABELS[def.type]}</TableCell>
              <TableCell className="text-muted-foreground">
                {def.type === "SELECT" ? def.options.join(", ") : "—"}
              </TableCell>
              <TableCell className="text-right">
                <Button type="button" variant="ghost" size="sm" disabled={isPending} onClick={() => handleDelete(def.id)}>
                  <X className="size-4" />
                </Button>
              </TableCell>
            </TableRow>
          ))}
          <TableRow>
            <TableCell>
              <Input
                placeholder="Название поля"
                className="h-8"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </TableCell>
            <TableCell>
              <Select value={type} items={TYPE_LABELS} onValueChange={(v) => setType(v as CustomFieldType)}>
                <SelectTrigger className="h-8 w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(TYPE_LABELS).map(([value, label]) => (
                    <SelectItem key={value} value={value}>
                      {label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </TableCell>
            <TableCell>
              {type === "SELECT" && (
                <Input
                  placeholder="вариант1, вариант2"
                  className="h-8"
                  value={options}
                  onChange={(e) => setOptions(e.target.value)}
                />
              )}
            </TableCell>
            <TableCell className="text-right">
              <Button type="button" size="sm" disabled={isPending || !name.trim()} onClick={handleCreate}>
                Добавить
              </Button>
            </TableCell>
          </TableRow>
        </TableBody>
      </Table>
    </div>
  );
}

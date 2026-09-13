"use client";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { CustomFieldDef } from "@/lib/custom-fields";

interface CustomFieldsEditorProps {
  defs: CustomFieldDef[];
  values: Record<string, string>;
  onChange: (definitionId: string, value: string) => void;
}

/** Not a real option — base-ui's Select treats "" as "nothing selected", so
 * the "unset" choice needs its own sentinel, translated back to "" at the
 * boundary. */
const EMPTY_VALUE = "__empty__";

/** Controlled counterpart of CustomFieldsSection, for forms driven by React
 * state + a direct Server Action call (Order, PurchaseOrder) rather than a
 * native `<form action>`. */
export function CustomFieldsEditor({ defs, values, onChange }: CustomFieldsEditorProps) {
  if (defs.length === 0) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Дополнительные поля</CardTitle>
      </CardHeader>
      <CardContent className="grid gap-4 sm:grid-cols-2">
        {defs.map((def) => {
          const value = values[def.id] ?? "";
          return (
            <div key={def.id} className="flex flex-col gap-2">
              <Label htmlFor={`cf-${def.id}`}>{def.name}</Label>
              {def.type === "BOOLEAN" ? (
                <div className="flex h-9 items-center">
                  <Checkbox
                    id={`cf-${def.id}`}
                    checked={value === "true"}
                    onCheckedChange={(checked) => onChange(def.id, checked === true ? "true" : "false")}
                  />
                </div>
              ) : def.type === "SELECT" || def.type === "CUSTOM_ENTITY" ? (
                <Select
                  value={value || EMPTY_VALUE}
                  items={{ [EMPTY_VALUE]: "—", ...Object.fromEntries(def.options.map((o) => [o, o])) }}
                  onValueChange={(v) => onChange(def.id, !v || v === EMPTY_VALUE ? "" : v)}
                >
                  <SelectTrigger id={`cf-${def.id}`} className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={EMPTY_VALUE}>—</SelectItem>
                    {def.options.map((opt) => (
                      <SelectItem key={opt} value={opt}>
                        {opt}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : (
                <Input
                  id={`cf-${def.id}`}
                  type={def.type === "NUMBER" ? "number" : def.type === "DATE" ? "date" : "text"}
                  step={def.type === "NUMBER" ? "any" : undefined}
                  value={value}
                  onChange={(e) => onChange(def.id, e.target.value)}
                />
              )}
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}

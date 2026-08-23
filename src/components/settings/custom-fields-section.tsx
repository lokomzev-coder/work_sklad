import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { CustomFieldDef } from "@/lib/custom-fields";

interface CustomFieldsSectionProps {
  defs: CustomFieldDef[];
  values: Record<string, string>;
}

/** Plain named inputs (`customField_<definitionId>`) so they submit as part of
 * whatever <form action=...> already wraps this — no client state needed. */
export function CustomFieldsSection({ defs, values }: CustomFieldsSectionProps) {
  if (defs.length === 0) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Дополнительные поля</CardTitle>
      </CardHeader>
      <CardContent className="grid gap-4 sm:grid-cols-2">
        {defs.map((def) => {
          const name = `customField_${def.id}`;
          const value = values[def.id] ?? "";
          return (
            <div key={def.id} className="flex flex-col gap-2">
              <Label htmlFor={name}>{def.name}</Label>
              {def.type === "BOOLEAN" ? (
                <div className="flex h-9 items-center">
                  <Checkbox id={name} name={name} defaultChecked={value === "true"} />
                </div>
              ) : def.type === "SELECT" ? (
                <select
                  id={name}
                  name={name}
                  defaultValue={value}
                  className="h-9 rounded-md border bg-background px-3 text-sm"
                >
                  <option value="">—</option>
                  {def.options.map((opt) => (
                    <option key={opt} value={opt}>
                      {opt}
                    </option>
                  ))}
                </select>
              ) : (
                <Input
                  id={name}
                  name={name}
                  type={def.type === "NUMBER" ? "number" : def.type === "DATE" ? "date" : "text"}
                  step={def.type === "NUMBER" ? "any" : undefined}
                  defaultValue={value}
                />
              )}
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}

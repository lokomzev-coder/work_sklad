import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

interface ClientRelatedFieldsPanelProps {
  counterpartyLabel: string;
  fields: { label: string; value: string }[];
}

/** Read-only display of Client fields an admin configured (Settings →
 * «Поля клиента в документах») to surface on a document referencing that
 * Client. Server-renderable, no interactivity — same "return null if
 * empty" convention as CustomFieldsSection. */
export function ClientRelatedFieldsPanel({ counterpartyLabel, fields }: ClientRelatedFieldsPanelProps) {
  if (fields.length === 0) return null;
  return (
    <Card>
      <CardHeader>
        <CardTitle>Данные: {counterpartyLabel}</CardTitle>
      </CardHeader>
      <CardContent className="grid gap-2 sm:grid-cols-2">
        {fields.map((f, i) => (
          <div key={i} className="flex flex-col">
            <span className="text-xs text-muted-foreground">{f.label}</span>
            <span className="text-sm">{f.value}</span>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

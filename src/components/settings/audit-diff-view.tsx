"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";

type DiffValue = Record<string, unknown> | Record<string, { from: unknown; to: unknown }> | null;

function formatValue(v: unknown): string {
  if (v === null || v === undefined) return "—";
  if (typeof v === "object") return JSON.stringify(v);
  return String(v);
}

/** UPDATE rows store `{field: {from, to}}`; CREATE/DELETE store a plain
 * snapshot object — this renders either shape as a compact "field: value"
 * list rather than raw JSON, expandable since a snapshot can be long. */
export function AuditDiffView({ diff, action }: { diff: DiffValue; action: string }) {
  const [expanded, setExpanded] = useState(false);
  if (!diff) return <span className="text-muted-foreground">—</span>;

  const entries = Object.entries(diff);
  if (entries.length === 0) return <span className="text-muted-foreground">—</span>;

  const visible = expanded ? entries : entries.slice(0, 3);

  return (
    <div className="flex flex-col gap-0.5 text-xs">
      {visible.map(([field, value]) => (
        <div key={field}>
          <span className="font-medium">{field}</span>
          {action === "UPDATE" && value && typeof value === "object" && "from" in value && "to" in value ? (
            <>
              : <span className="text-muted-foreground">{formatValue((value as { from: unknown; to: unknown }).from)}</span>
              {" → "}
              <span>{formatValue((value as { from: unknown; to: unknown }).to)}</span>
            </>
          ) : (
            <>: {formatValue(value)}</>
          )}
        </div>
      ))}
      {entries.length > 3 && (
        <Button type="button" variant="link" size="sm" className="h-auto justify-start p-0 text-xs" onClick={() => setExpanded((v) => !v)}>
          {expanded ? "Свернуть" : `Ещё ${entries.length - 3}...`}
        </Button>
      )}
    </div>
  );
}

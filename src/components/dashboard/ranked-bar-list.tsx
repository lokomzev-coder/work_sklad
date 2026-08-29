import { formatValue, type ValueFormat } from "@/lib/format";

interface RankedBarListProps {
  rows: { name: string; value: number }[];
  format: ValueFormat;
  emptyLabel: string;
}

/** Lightweight ranked top-N list with an inline proportional bar — used for
 * "top clients" / "top items", where a full chart axis would be overkill for
 * 5 rows. Plain divs (no recharts instance) on purpose. */
export function RankedBarList({ rows, format, emptyLabel }: RankedBarListProps) {
  if (rows.length === 0) {
    return <p className="py-6 text-center text-sm text-muted-foreground">{emptyLabel}</p>;
  }

  const max = Math.max(...rows.map((r) => r.value), 1);

  return (
    <div className="flex flex-col gap-3">
      {rows.map((row) => (
        <div key={row.name} className="flex flex-col gap-1">
          <div className="flex items-center justify-between gap-2 text-sm">
            <span className="truncate font-medium">{row.name}</span>
            <span className="shrink-0 font-mono tabular-nums text-muted-foreground">
              {formatValue(row.value, format)}
            </span>
          </div>
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full bg-primary"
              style={{ width: `${Math.max((row.value / max) * 100, 3)}%` }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}

/** `Intl.NumberFormat` throws for a currency code it doesn't recognize —
 * possible here since org currencies (settings/currencies) are free-form
 * strings, not validated against ISO 4217. Falls back to a plain
 * "1234.56 XYZ" rendering rather than crashing the page. */
export function formatMoney(amount: number, currency: string): string {
  try {
    return new Intl.NumberFormat("ru-RU", {
      style: "currency",
      currency,
      maximumFractionDigits: 2,
    }).format(amount);
  } catch {
    return `${amount.toLocaleString("ru-RU", { maximumFractionDigits: 2 })} ${currency}`;
  }
}

/** Compact form for KPI tiles: 1 234 567 → "1,2 млн". Falls back to a plain
 * grouped number below 1000 (a "1,2 тыс" for 1 200 would read worse than
 * "1 200"). */
export function formatCompactNumber(value: number): string {
  const abs = Math.abs(value);
  if (abs >= 1_000_000) return `${(value / 1_000_000).toLocaleString("ru-RU", { maximumFractionDigits: 1 })} млн`;
  if (abs >= 10_000) return `${(value / 1_000).toLocaleString("ru-RU", { maximumFractionDigits: 1 })} тыс`;
  return value.toLocaleString("ru-RU", { maximumFractionDigits: 0 });
}

/** A serializable description of how to format a chart value — chart
 * components are Client Components, and a formatter *function* built in a
 * Server Component page can't be passed to them as a prop (React only lets
 * plain data cross that boundary, functions included, so `(v) => ...`
 * closures throw at render time); this plain-object stand-in can. */
export type ValueFormat = { kind: "money"; currency: string } | { kind: "compact" };

export function formatValue(value: number, format: ValueFormat): string {
  return format.kind === "money" ? formatMoney(value, format.currency) : formatCompactNumber(value);
}

export function formatPercent(value: number): string {
  const sign = value > 0 ? "+" : "";
  return `${sign}${value.toLocaleString("ru-RU", { maximumFractionDigits: 1 })}%`;
}

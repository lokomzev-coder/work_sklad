"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

interface QuerySelectFilterProps {
  basePath: string;
  paramName: string;
  value: string;
  allLabel: string;
  options: { value: string; label: string }[];
}

/** Not a real option value — base-ui's Select treats "" as "nothing
 * selected", so the "show everything" choice needs its own sentinel,
 * translated back to "" (removes the query param) at the boundary. */
const ALL_VALUE = "__all__";

/** Filters a list page via a URL query param — navigates on change,
 * preserves other existing query params. */
export function QuerySelectFilter({
  basePath,
  paramName,
  value,
  allLabel,
  options,
}: QuerySelectFilterProps) {
  const router = useRouter();
  const searchParams = useSearchParams();

  function handleChange(next: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (next && next !== ALL_VALUE) {
      params.set(paramName, next);
    } else {
      params.delete(paramName);
    }
    const query = params.toString();
    router.push(query ? `${basePath}?${query}` : basePath);
  }

  return (
    <Select
      value={value || ALL_VALUE}
      items={{ [ALL_VALUE]: allLabel, ...Object.fromEntries(options.map((o) => [o.value, o.label])) }}
      onValueChange={(v) => handleChange(v ?? ALL_VALUE)}
    >
      <SelectTrigger className="h-9 w-full">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={ALL_VALUE}>{allLabel}</SelectItem>
        {options.map((opt) => (
          <SelectItem key={opt.value} value={opt.value}>
            {opt.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

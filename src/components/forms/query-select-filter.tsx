"use client";

import { useRouter, useSearchParams } from "next/navigation";

interface QuerySelectFilterProps {
  basePath: string;
  paramName: string;
  value: string;
  allLabel: string;
  options: { value: string; label: string }[];
}

/** A plain <select> that filters a list page via a URL query param —
 * navigates on change, preserves other existing query params. */
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
    if (next) {
      params.set(paramName, next);
    } else {
      params.delete(paramName);
    }
    const query = params.toString();
    router.push(query ? `${basePath}?${query}` : basePath);
  }

  return (
    <select
      className="h-9 rounded-md border bg-background px-3 text-sm"
      value={value}
      onChange={(e) => handleChange(e.target.value)}
    >
      <option value="">{allLabel}</option>
      {options.map((opt) => (
        <option key={opt.value} value={opt.value}>
          {opt.label}
        </option>
      ))}
    </select>
  );
}

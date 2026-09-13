"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Input } from "@/components/ui/input";

interface QuerySearchInputProps {
  basePath: string;
  paramName: string;
  value: string;
  placeholder?: string;
}

/** Same URL-query-param-driven filtering idiom as QuerySelectFilter, for a
 * free-text search box — navigates on Enter/blur, not on every keystroke
 * (a full page navigation per keystroke would be a poor server-component
 * fit here). */
export function QuerySearchInput({ basePath, paramName, value, placeholder }: QuerySearchInputProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [draft, setDraft] = useState(value);

  function commit() {
    const params = new URLSearchParams(searchParams.toString());
    if (draft.trim()) {
      params.set(paramName, draft.trim());
    } else {
      params.delete(paramName);
    }
    const query = params.toString();
    router.push(query ? `${basePath}?${query}` : basePath);
  }

  return (
    <Input
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === "Enter") commit();
      }}
      placeholder={placeholder}
      className="max-w-sm"
    />
  );
}

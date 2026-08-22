"use client";

import { useCallback, useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { searchOrg, type SearchResults } from "@/actions/search";

const EMPTY_RESULTS: SearchResults = {
  employees: [],
  clients: [],
  catalogItems: [],
  orders: [],
};

const GROUPS: { key: keyof SearchResults; heading: string }[] = [
  { key: "orders", heading: "Заказы" },
  { key: "clients", heading: "Клиенты" },
  { key: "employees", heading: "Сотрудники" },
  { key: "catalogItems", heading: "Товары и услуги" },
];

interface CommandPaletteProps {
  orgSlug: string;
}

export function CommandPalette({ orgSlug }: CommandPaletteProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResults>(EMPTY_RESULTS);
  const [, startTransition] = useTransition();

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpen((prev) => !prev);
      }
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, []);

  useEffect(() => {
    if (!open) return;
    const trimmed = query.trim();
    if (trimmed.length === 0) {
      setResults(EMPTY_RESULTS);
      return;
    }
    const timeout = setTimeout(() => {
      startTransition(async () => {
        const data = await searchOrg(orgSlug, trimmed);
        setResults(data);
      });
    }, 200);
    return () => clearTimeout(timeout);
  }, [query, open, orgSlug]);

  const navigate = useCallback(
    (href: string) => {
      setOpen(false);
      setQuery("");
      router.push(href);
    },
    [router],
  );

  const hasResults = GROUPS.some((g) => results[g.key].length > 0);

  return (
    <>
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() => setOpen(true)}
        className="w-64 justify-start gap-2 text-muted-foreground font-normal"
      >
        <Search className="size-4" />
        Поиск...
        <kbd className="ml-auto rounded border bg-muted px-1.5 py-0.5 text-[0.7rem] font-medium">
          ⌘K
        </kbd>
      </Button>
      <CommandDialog
      open={open}
      onOpenChange={setOpen}
      title="Поиск"
      description="Поиск по клиентам, заказам, сотрудникам и каталогу"
    >
      <CommandInput
        placeholder="Поиск по клиентам, заказам, сотрудникам, товарам..."
        value={query}
        onValueChange={setQuery}
      />
      <CommandList>
        {query.trim().length === 0 ? (
          <CommandEmpty>Начните вводить запрос...</CommandEmpty>
        ) : !hasResults ? (
          <CommandEmpty>Ничего не найдено</CommandEmpty>
        ) : (
          GROUPS.map(({ key, heading }) =>
            results[key].length === 0 ? null : (
              <CommandGroup key={key} heading={heading}>
                {results[key].map((item) => (
                  <CommandItem
                    key={item.id}
                    value={`${key}-${item.id}-${item.label}`}
                    onSelect={() => navigate(item.href)}
                  >
                    <div className="flex flex-col">
                      <span>{item.label}</span>
                      {item.sublabel && (
                        <span className="text-xs text-muted-foreground">
                          {item.sublabel}
                        </span>
                      )}
                    </div>
                  </CommandItem>
                ))}
              </CommandGroup>
            ),
          )
        )}
      </CommandList>
      </CommandDialog>
    </>
  );
}

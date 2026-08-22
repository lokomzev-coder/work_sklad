import Link from "next/link";
import { cn } from "@/lib/utils";

interface CatalogSubnavProps {
  org: string;
  active: "catalog" | "groups" | "units" | "characteristics";
}

const TABS = [
  { key: "catalog", label: "Каталог", href: "" },
  { key: "groups", label: "Группы", href: "/groups" },
  { key: "units", label: "Единицы измерения", href: "/units" },
  { key: "characteristics", label: "Характеристики", href: "/characteristics" },
] as const;

export function CatalogSubnav({ org, active }: CatalogSubnavProps) {
  return (
    <div className="flex gap-1 border-b">
      {TABS.map((tab) => (
        <Link
          key={tab.key}
          href={`/${org}/catalog${tab.href}`}
          className={cn(
            "border-b-2 px-3 py-2 text-sm font-medium transition-colors",
            active === tab.key
              ? "border-primary text-foreground"
              : "border-transparent text-muted-foreground hover:text-foreground",
          )}
        >
          {tab.label}
        </Link>
      ))}
    </div>
  );
}

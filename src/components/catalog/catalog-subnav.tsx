import Link from "next/link";
import { cn } from "@/lib/utils";

interface CatalogSubnavProps {
  org: string;
  active: "catalog" | "groups" | "units" | "characteristics" | "price-list";
}

const TABS = [
  { key: "catalog", label: "Каталог", href: "" },
  { key: "groups", label: "Группы", href: "/groups" },
  { key: "units", label: "Единицы измерения", href: "/units" },
  { key: "characteristics", label: "Характеристики", href: "/characteristics" },
  { key: "price-list", label: "Прайс-лист", href: "/price-list" },
] as const;

export function CatalogSubnav({ org, active }: CatalogSubnavProps) {
  return (
    <div className="flex flex-wrap gap-2">
      {TABS.map((tab) => (
        <Link
          key={tab.key}
          href={`/${org}/catalog${tab.href}`}
          className={cn(
            "rounded-full px-4 py-2 text-sm font-semibold transition-colors",
            active === tab.key
              ? "bg-primary text-primary-foreground"
              : "bg-secondary text-secondary-foreground hover:text-foreground",
          )}
        >
          {tab.label}
        </Link>
      ))}
    </div>
  );
}

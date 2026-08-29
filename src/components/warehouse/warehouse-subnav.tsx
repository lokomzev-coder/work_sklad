import Link from "next/link";
import { cn } from "@/lib/utils";

interface WarehouseSubnavProps {
  org: string;
  active: "movements" | "stock" | "stores";
}

const TABS = [
  { key: "movements", label: "Движения", href: "" },
  { key: "stock", label: "Остатки", href: "/stock" },
  { key: "stores", label: "Склады", href: "/stores" },
] as const;

export function WarehouseSubnav({ org, active }: WarehouseSubnavProps) {
  return (
    <div className="flex flex-wrap gap-1 border-b">
      {TABS.map((tab) => (
        <Link
          key={tab.key}
          href={`/${org}/warehouse${tab.href}`}
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

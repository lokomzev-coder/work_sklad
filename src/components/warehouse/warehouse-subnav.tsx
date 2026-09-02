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
    <div className="flex flex-wrap gap-2">
      {TABS.map((tab) => (
        <Link
          key={tab.key}
          href={`/${org}/warehouse${tab.href}`}
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

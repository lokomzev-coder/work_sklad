import Link from "next/link";
import { cn } from "@/lib/utils";

interface OrdersSubnavProps {
  org: string;
  active: "orders" | "channels";
}

const TABS = [
  { key: "orders", label: "Заказы", href: "" },
  { key: "channels", label: "Каналы продаж", href: "/channels" },
] as const;

export function OrdersSubnav({ org, active }: OrdersSubnavProps) {
  return (
    <div className="flex gap-1 border-b">
      {TABS.map((tab) => (
        <Link
          key={tab.key}
          href={`/${org}/orders${tab.href}`}
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

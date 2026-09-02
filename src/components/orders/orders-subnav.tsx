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
    <div className="flex flex-wrap gap-2">
      {TABS.map((tab) => (
        <Link
          key={tab.key}
          href={`/${org}/orders${tab.href}`}
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

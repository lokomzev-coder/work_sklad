import Link from "next/link";
import { cn } from "@/lib/utils";

interface PaymentsSubnavProps {
  org: string;
  active: "payments" | "cash-orders";
}

const TABS = [
  { key: "payments", label: "Платежи", href: "" },
  { key: "cash-orders", label: "Кассовые ордера", href: "/cash-orders" },
] as const;

export function PaymentsSubnav({ org, active }: PaymentsSubnavProps) {
  return (
    <div className="flex flex-wrap gap-2">
      {TABS.map((tab) => (
        <Link
          key={tab.key}
          href={`/${org}/payments${tab.href}`}
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

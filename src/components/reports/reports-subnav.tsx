import Link from "next/link";
import { cn } from "@/lib/utils";

interface ReportsSubnavProps {
  org: string;
  active: "turnover" | "money" | "pnl" | "sales-by-client";
}

const TABS = [
  { key: "turnover", label: "Обороты", href: "/turnover" },
  { key: "money", label: "Деньги", href: "/money" },
  { key: "pnl", label: "Прибыли и убытки", href: "/pnl" },
  { key: "sales-by-client", label: "Продажи по клиентам", href: "/sales-by-client" },
] as const;

export function ReportsSubnav({ org, active }: ReportsSubnavProps) {
  return (
    <div className="flex flex-wrap gap-1 border-b">
      {TABS.map((tab) => (
        <Link
          key={tab.key}
          href={`/${org}/reports${tab.href}`}
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

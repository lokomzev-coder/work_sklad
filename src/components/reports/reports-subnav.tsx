import Link from "next/link";
import { cn } from "@/lib/utils";

interface ReportsSubnavProps {
  org: string;
  active: "overview" | "turnover" | "money" | "pnl" | "sales-by-client" | "abc";
}

const TABS = [
  { key: "overview", label: "Обзор", href: "/overview" },
  { key: "turnover", label: "Обороты", href: "/turnover" },
  { key: "money", label: "Деньги", href: "/money" },
  { key: "pnl", label: "Прибыли и убытки", href: "/pnl" },
  { key: "sales-by-client", label: "Продажи по клиентам", href: "/sales-by-client" },
  { key: "abc", label: "ABC-анализ", href: "/abc" },
] as const;

export function ReportsSubnav({ org, active }: ReportsSubnavProps) {
  return (
    <div className="flex flex-wrap gap-2">
      {TABS.map((tab) => (
        <Link
          key={tab.key}
          href={`/${org}/reports${tab.href}`}
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

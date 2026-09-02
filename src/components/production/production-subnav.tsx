import Link from "next/link";
import { cn } from "@/lib/utils";

interface ProductionSubnavProps {
  org: string;
  active: "tasks" | "tech-cards" | "stages" | "tech-processes";
}

const TABS = [
  { key: "tasks", label: "Задания", href: "" },
  { key: "tech-cards", label: "Техкарты", href: "/tech-cards" },
  { key: "stages", label: "Этапы", href: "/stages" },
  { key: "tech-processes", label: "Техпроцессы", href: "/tech-processes" },
] as const;

export function ProductionSubnav({ org, active }: ProductionSubnavProps) {
  return (
    <div className="flex flex-wrap gap-2">
      {TABS.map((tab) => (
        <Link
          key={tab.key}
          href={`/${org}/production${tab.href}`}
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

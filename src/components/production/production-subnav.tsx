import Link from "next/link";
import { cn } from "@/lib/utils";

interface ProductionSubnavProps {
  org: string;
  active: "tasks" | "tech-cards";
}

const TABS = [
  { key: "tasks", label: "Задания", href: "" },
  { key: "tech-cards", label: "Техкарты", href: "/tech-cards" },
] as const;

export function ProductionSubnav({ org, active }: ProductionSubnavProps) {
  return (
    <div className="flex flex-wrap gap-1 border-b">
      {TABS.map((tab) => (
        <Link
          key={tab.key}
          href={`/${org}/production${tab.href}`}
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

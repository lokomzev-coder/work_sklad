import Link from "next/link";
import { cn } from "@/lib/utils";

interface SettingsSubnavProps {
  org: string;
  active: "legal-entities" | "statuses" | "currencies" | "custom-fields" | "webhooks" | "roles" | "groups";
}

const TABS = [
  { key: "legal-entities", label: "Юрлица", href: "/legal-entities" },
  { key: "statuses", label: "Статусы документов", href: "/statuses" },
  { key: "currencies", label: "Валюта", href: "/currencies" },
  { key: "custom-fields", label: "Доп. поля", href: "/custom-fields" },
  { key: "webhooks", label: "Вебхуки", href: "/webhooks" },
  { key: "roles", label: "Роли доступа", href: "/roles" },
  { key: "groups", label: "Отделы", href: "/groups" },
] as const;

export function SettingsSubnav({ org, active }: SettingsSubnavProps) {
  return (
    <div className="flex flex-wrap gap-1 border-b">
      {TABS.map((tab) => (
        <Link
          key={tab.key}
          href={`/${org}/settings${tab.href}`}
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

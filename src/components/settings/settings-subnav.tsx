import Link from "next/link";
import { cn } from "@/lib/utils";

interface SettingsSubnavProps {
  org: string;
  active: "legal-entities" | "statuses" | "currencies" | "custom-fields" | "custom-entities" | "webhooks" | "api-keys" | "audit-log" | "price-types" | "discounts" | "expense-items" | "scenarios" | "import" | "roles" | "groups" | "subscription";
}

const TABS = [
  { key: "subscription", label: "Подписка", href: "/subscription" },
  { key: "legal-entities", label: "Юрлица", href: "/legal-entities" },
  { key: "statuses", label: "Статусы документов", href: "/statuses" },
  { key: "currencies", label: "Валюта", href: "/currencies" },
  { key: "custom-fields", label: "Доп. поля", href: "/custom-fields" },
  { key: "custom-entities", label: "Справочники", href: "/custom-entities" },
  { key: "price-types", label: "Типы цен", href: "/price-types" },
  { key: "discounts", label: "Скидки", href: "/discounts" },
  { key: "expense-items", label: "Статьи расходов", href: "/expense-items" },
  { key: "webhooks", label: "Вебхуки", href: "/webhooks" },
  { key: "api-keys", label: "API-ключи", href: "/api-keys" },
  { key: "audit-log", label: "Журнал изменений", href: "/audit-log" },
  { key: "scenarios", label: "Сценарии", href: "/scenarios" },
  { key: "import", label: "Импорт", href: "/import" },
  { key: "roles", label: "Роли доступа", href: "/roles" },
  { key: "groups", label: "Отделы", href: "/groups" },
] as const;

export function SettingsSubnav({ org, active }: SettingsSubnavProps) {
  return (
    <div className="flex flex-wrap gap-2">
      {TABS.map((tab) => (
        <Link
          key={tab.key}
          href={`/${org}/settings${tab.href}`}
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

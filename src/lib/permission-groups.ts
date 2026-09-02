import type { Resource } from "@/lib/permissions";

/** Client-safe metadata for the permissions matrix editor (Block I2.1) —
 * groups the resources the way the app's own nav is organized, and gives
 * each a Russian label. Kept separate from lib/permissions.ts so client
 * components can import labels without pulling in server-only code. */
export interface PermissionGroup {
  label: string;
  resources: { key: Resource; label: string }[];
}

export const PERMISSION_GROUPS: PermissionGroup[] = [
  {
    label: "Обзор",
    resources: [
      { key: "dashboard", label: "Дашборд" },
      { key: "reports", label: "Отчёты" },
    ],
  },
  {
    label: "Документы",
    resources: [
      { key: "orders", label: "Заказы" },
      { key: "purchaseOrders", label: "Заказы поставщику" },
      { key: "invoicesOut", label: "Счета покупателям" },
      { key: "invoicesIn", label: "Счета поставщиков" },
      { key: "contracts", label: "Договоры" },
      { key: "payments", label: "Платежи" },
      { key: "salesChannels", label: "Каналы продаж" },
    ],
  },
  {
    label: "Клиенты",
    resources: [{ key: "clients", label: "Клиенты" }],
  },
  {
    label: "Каталог и склад",
    resources: [
      { key: "catalog", label: "Товары и услуги" },
      { key: "warehouse", label: "Склад" },
    ],
  },
  {
    label: "Производство",
    resources: [
      { key: "techCards", label: "Техкарты" },
      { key: "techProcesses", label: "Техпроцессы и этапы" },
      { key: "productionOrders", label: "Производственные задания" },
    ],
  },
  {
    label: "Хранилище",
    resources: [{ key: "vault", label: "Пароли" }],
  },
  {
    label: "Сотрудники и доступ",
    resources: [
      { key: "employees", label: "Сотрудники" },
      { key: "membership", label: "Доступ в систему (логины)" },
      { key: "customRoles", label: "Роли доступа" },
    ],
  },
  {
    label: "Настройки",
    resources: [
      { key: "documentStatuses", label: "Статусы документов" },
      { key: "customFields", label: "Доп. поля" },
      { key: "webhooks", label: "Вебхуки" },
      { key: "legalEntities", label: "Юрлица" },
      { key: "exchangeRates", label: "Валюта" },
    ],
  },
];

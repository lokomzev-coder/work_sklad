/** Russian labels for the Prisma model names AuditLog.entityType can hold —
 * see AUDITED_MODELS in lib/audit-log.ts for the authoritative list. */
export const AUDIT_ENTITY_LABELS: Record<string, string> = {
  Client: "Клиент",
  Employee: "Сотрудник",
  Store: "Склад",
  Contract: "Договор",
  Project: "Проект",
  SalesChannel: "Канал продаж",
  LegalEntity: "Юрлицо",
  CatalogItem: "Товар/услуга",
  Order: "Заказ",
  PurchaseOrder: "Заказ поставщику",
  StockMovement: "Складское движение",
  Payment: "Платёж",
  InvoiceOut: "Счёт покупателю",
  InvoiceIn: "Счёт поставщика",
};

export const AUDIT_ACTION_LABELS: Record<string, string> = {
  CREATE: "Создано",
  UPDATE: "Изменено",
  DELETE: "Удалено",
};

export const AUDIT_SOURCE_LABELS: Record<string, string> = {
  UI: "Интерфейс",
  API: "API",
};

# Доступные типы сущностей

Источник истины — `src/lib/api-registry.ts`. Таблица ниже — краткая сводка;
**за полными типами полей, обязательными полями при создании и примерами
`curl` по каждой сущности см. `reference.md`**.

## Справочники (полный CRUD)

| `type` | Поля | Поиск (`search`) | expand |
|---|---|---|---|
| `client` | id, name, inn, phone, email, address, kpp, ogrn, bankName, bankBik, bankAccount, status, createdAt | name, email, phone, inn | — |
| `employee` | id, fullName, position, email, phone, status, createdAt | fullName, email | — |
| `store` | id, name, status, createdAt | name | — |
| `contract` | id, clientId, number, signedAt, createdAt | — | client |
| `project` | id, name, clientId, responsibleEmployeeId, startDate, endDate, budget, currency, status, createdAt | name | client, responsibleEmployee |
| `salesChannel` | id, name | name | — |
| `legalEntity` | id, name, inn, kpp, ogrn, address, bankName, bankBik, bankAccount, isDefault, status, createdAt | name, inn | — |
| `catalogItem` | id, name, type, sku, barcode, unitPrice, currency, unitId, groupId, taxRate, minStock, status, createdAt | name, sku, barcode | unit, group, variants, prices |
| `catalogItemVariant` | id, catalogItemId, sku, barcode, priceOverride, status, createdAt (только чтение) | — | values |
| `priceType` | id, name, isDefault, createdAt | name | prices |
| `discount` | id, name, type, value, target, targetId, startDate, endDate, isActive, createdAt | name | — |
| `customEntityType` | id, name, createdAt | name | values (сами значения справочника — управляются только через `values`, не отдельный тип) |
| `task` | id, title, description, dueDate, status, assignedEmployeeId, createdById, linkedEntityType, linkedEntityId, completedAt, createdAt | title | — |
| `expenseItem` | id, name, createdAt | name | — |
| `cashOrder` | id, direction, amount, currency, counterpartyId, expenseItemId, comment, createdById, createdAt | — | counterparty, expenseItem |
| `counterpartyAdjustment` | id, clientId, side, amount, comment, createdById, createdAt | — | client |

## Документы (только чтение в этой фазе — см. README.md за причиной)

| `type` | Поля | expand |
|---|---|---|
| `order` | id, number, clientId, assignedEmployeeId, contractId, salesChannelId, legalEntityId, storeId, projectId, statusId, isPosted, isReserved, createdAt | client, lineItems, status |
| `purchaseOrder` | id, number, supplierId, assignedEmployeeId, contractId, legalEntityId, statusId, createdAt | supplier, lineItems, status, contract, legalEntity |
| `stockMovement` | id, type, number, storeId, toStoreId, orderId, purchaseOrderId, isPosted, postedAt, comment, createdAt | store, toStore, lines |
| `payment` | id, direction, amount, currency, counterpartyId, orderId, purchaseOrderId, invoiceOutId, invoiceInId, method, comment, createdAt | counterparty |
| `invoiceOut` | id, number, clientId, orderId, statusId, createdAt | client, lineItems, status |
| `invoiceIn` | id, number, supplierId, purchaseOrderId, statusId, createdAt | supplier, lineItems, status |

## Журнал изменений (только чтение)

| `type` | Поля | Примечание |
|---|---|---|
| `auditLog` | id, entityType, entityId, action, source, actorUserId, actorLabel, diff, createdAt | Записи создаются автоматически (см. `README.md` — надёжно только для мутаций через этот же API, для действий из интерфейса — не в этой версии, см. `ROADMAP.md` Блок O фаза 3) |

## Пример: получить каталог с вариантами

```bash
curl -H "Authorization: Bearer $API_KEY" \
  "https://ваш-домен/api/v1/entity/catalogItem?expand=variants&limit=20"
```

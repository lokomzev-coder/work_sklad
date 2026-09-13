# Полный референс по типам сущностей

Дополняет `README.md` (конвенции/авторизация) и `errors-and-limits.md`
(коды ошибок/фильтрация/лимиты) — здесь по каждому типу сущности из
`src/lib/api-registry.ts` (источник истины) даны полная таблица полей с
типами, что доступно для `search`/`expand`, обязательные поля при создании
и пример `curl` для чтения и (где применимо) создания.

Условные обозначения в колонке «Доступ»: **R** — только чтение (поле нельзя
передать в `POST`/`PUT`, даже если оно есть в ответе), **RW** — можно и
читать, и писать. Колонка «Тип» — как поле ведёт себя в `filter`/теле
запроса: `string`, `number`, `boolean`, `date` (ISO-8601, например
`"2026-01-01"` или `"2026-01-01T12:00:00Z"`), `enum` (список значений
приведён), или `id` (строка-идентификатор связанной записи, настоящий
внешний ключ, если не сказано иное).

---

## Справочники (`writable: true` — полный CRUD)

### `client` — Клиенты/контрагенты

| Поле | Тип | Доступ | Примечание |
|---|---|---|---|
| `id` | string | R | |
| `name` | string | RW | обязательно при создании |
| `inn` | string | RW | ИНН — строка из цифр, НЕ число |
| `phone` | string | RW | |
| `email` | string | RW | |
| `address` | string | RW | |
| `kpp` | string | RW | |
| `ogrn` | string | RW | строка из цифр |
| `bankName` | string | RW | |
| `bankBik` | string | RW | |
| `bankAccount` | string | RW | |
| `status` | enum (`ACTIVE`\|`ARCHIVED`) | RW | |
| `createdAt` | date | R | |

Поиск (`search`): `name`, `email`, `phone`, `inn`. `expand`: недоступен.

```bash
curl -H "Authorization: Bearer $API_KEY" \
  "https://ваш-домен/api/v1/entity/client?search=Ромашка&limit=10"

curl -X POST -H "Authorization: Bearer $API_KEY" -H "Content-Type: application/json" \
  -d '{"name":"ООО Ромашка","inn":"7700000000","email":"info@romashka.ru"}' \
  "https://ваш-домен/api/v1/entity/client"
```

### `employee` — Сотрудники

| Поле | Тип | Доступ | Примечание |
|---|---|---|---|
| `id` | string | R | |
| `fullName` | string | RW | обязательно |
| `position` | string | RW | должность, свободный текст |
| `email` | string | RW | |
| `phone` | string | RW | |
| `status` | enum (`ACTIVE`\|`ARCHIVED`) | RW | |
| `createdAt` | date | R | |

Поиск: `fullName`, `email`. `expand`: недоступен.

```bash
curl -X POST -H "Authorization: Bearer $API_KEY" -H "Content-Type: application/json" \
  -d '{"fullName":"Иванов Иван","position":"Менеджер по продажам"}' \
  "https://ваш-домен/api/v1/entity/employee"
```

### `store` — Склады

| Поле | Тип | Доступ | Примечание |
|---|---|---|---|
| `id` | string | R | |
| `name` | string | RW | обязательно |
| `status` | enum (`ACTIVE`\|`ARCHIVED`) | RW | |
| `createdAt` | date | R | |

Поиск: `name`. `expand`: недоступен.

### `contract` — Договоры

| Поле | Тип | Доступ | Примечание |
|---|---|---|---|
| `id` | string | R | |
| `clientId` | id → `client` | RW | обязательно |
| `number` | string | RW | обязательно; свободный текст («Б/Н-123»), не число |
| `signedAt` | date | RW | |
| `createdAt` | date | R | |

Поиск: недоступен. `expand`: `client`.

```bash
curl -H "Authorization: Bearer $API_KEY" \
  "https://ваш-домен/api/v1/entity/contract?expand=client"
```

### `project` — Проекты

| Поле | Тип | Доступ | Примечание |
|---|---|---|---|
| `id` | string | R | |
| `name` | string | RW | обязательно |
| `clientId` | id → `client` | RW | |
| `responsibleEmployeeId` | id → `employee` | RW | |
| `startDate` | date | RW | |
| `endDate` | date | RW | |
| `budget` | number | RW | |
| `currency` | string | RW | код валюты, например `"RUB"` |
| `status` | enum (`ACTIVE`\|`ARCHIVED`) | RW | |
| `createdAt` | date | R | |

Поиск: `name`. `expand`: `client`, `responsibleEmployee`.

### `salesChannel` — Каналы продаж

| Поле | Тип | Доступ | Примечание |
|---|---|---|---|
| `id` | string | R | |
| `name` | string | RW | обязательно |

Поиск: `name`. `expand`: недоступен.

### `legalEntity` — Юридические лица (свои организации)

| Поле | Тип | Доступ | Примечание |
|---|---|---|---|
| `id` | string | R | |
| `name` | string | RW | обязательно |
| `inn` | string | RW | |
| `kpp` | string | RW | |
| `ogrn` | string | RW | |
| `address` | string | RW | |
| `bankName` | string | RW | |
| `bankBik` | string | RW | |
| `bankAccount` | string | RW | |
| `isDefault` | boolean | RW | юрлицо по умолчанию для новых документов |
| `status` | enum (`ACTIVE`\|`ARCHIVED`) | RW | |
| `createdAt` | date | R | |

Поиск: `name`, `inn`. `expand`: недоступен.

### `catalogItem` — Товары/услуги/комплекты

| Поле | Тип | Доступ | Примечание |
|---|---|---|---|
| `id` | string | R | |
| `name` | string | RW | обязательно |
| `type` | enum (`PRODUCT`\|`SERVICE`\|`BUNDLE`) | RW | обязательно |
| `sku` | string | RW | артикул — строка, не число |
| `barcode` | string | RW | штрихкод — строка, не число |
| `unitPrice` | number | RW | обязательно; базовая цена (тип цены/скидка её НЕ переопределяют — см. `priceType`/`discount` ниже) |
| `currency` | string | RW | по умолчанию `"RUB"` |
| `unitId` | id → единица измерения | RW | |
| `groupId` | id → группа каталога | RW | |
| `taxRate` | enum (`NONE`\|`VAT_0`\|`VAT_10`\|`VAT_20`\|`VAT_10_110`\|`VAT_20_120`) | RW | ставка НДС, используется при фискализации |
| `minStock` | number | RW | минимальный остаток для отчёта о дефиците; `null`/не задано = не отслеживается |
| `status` | enum (`ACTIVE`\|`ARCHIVED`) | RW | |
| `createdAt` | date | R | |

Поиск: `name`, `sku`, `barcode`. `expand`: `unit`, `group`, `variants`,
`prices` (вкладывает `priceType` каждой записи цены).

```bash
curl -H "Authorization: Bearer $API_KEY" \
  "https://ваш-домен/api/v1/entity/catalogItem?expand=prices,variants&filter=status=ACTIVE"

curl -X POST -H "Authorization: Bearer $API_KEY" -H "Content-Type: application/json" \
  -d '{"name":"Виджет","type":"PRODUCT","unitPrice":150,"taxRate":"VAT_20"}' \
  "https://ваш-домен/api/v1/entity/catalogItem"
```

### `catalogItemVariant` — Модификации товара (`writable: false`)

Только чтение — модификации создаются/редактируются через интерфейс
(`Каталог → карточка товара → Модификации`), где они завязаны на
характеристики (`Characteristic`), которых у API-ключа нет прав создавать.

| Поле | Тип | Доступ | Примечание |
|---|---|---|---|
| `id` | string | R | |
| `catalogItemId` | id → `catalogItem` | R | |
| `sku` | string | R | |
| `barcode` | string | R | |
| `priceOverride` | number | R | переопределяет `catalogItem.unitPrice`, если задано |
| `status` | enum (`ACTIVE`\|`ARCHIVED`) | R | |
| `createdAt` | date | R | |

`expand`: `values` (вкладывает `characteristic` каждого значения).

### `priceType` — Типы цен

| Поле | Тип | Доступ | Примечание |
|---|---|---|---|
| `id` | string | R | |
| `name` | string | RW | обязательно |
| `isDefault` | boolean | RW | |
| `createdAt` | date | R | |

Поиск: `name`. `expand`: `prices` (вкладывает `catalogItem` каждой записи).
Сами значения цены по товару (`CatalogItemPrice`) управляются только через
интерфейс карточки товара — отдельного API-типа для них нет, читаются через
`catalogItem?expand=prices` или `priceType?expand=prices`.

**Не влияет на фактическую цену** в Заказе/Розничной продаже/Счёте — та
по-прежнему всегда берётся из `catalogItem.unitPrice`. См. `README.md`.

### `discount` — Скидки

| Поле | Тип | Доступ | Примечание |
|---|---|---|---|
| `id` | string | R | |
| `name` | string | RW | обязательно |
| `type` | enum (`PERCENTAGE`\|`FIXED_AMOUNT`) | RW | обязательно |
| `value` | number | RW | обязательно; для `PERCENTAGE` — не больше 100 (проверяется сервером) |
| `target` | enum (`ALL`\|`CATALOG_GROUP`\|`CATALOG_ITEM`\|`CLIENT`) | RW | по умолчанию `ALL` |
| `targetId` | id (полиморфный — см. ниже) | RW | обязателен, если `target` не `ALL`; тип целевой записи зависит от `target` |
| `startDate` | date | RW | |
| `endDate` | date | RW | |
| `isActive` | boolean | RW | по умолчанию `true` |
| `createdAt` | date | R | |

Поиск: `name`. `expand`: недоступен. Сервер проверяет, что `targetId`
реально существует в вашей организации и относится к нужному типу
(`CatalogGroup`/`catalogItem`/`client` — в зависимости от `target`) —
несуществующий или чужой id вернёт `400`, не тихо примет.

```bash
curl -X POST -H "Authorization: Bearer $API_KEY" -H "Content-Type: application/json" \
  -d '{"name":"Скидка 10%","type":"PERCENTAGE","value":10,"target":"CATALOG_ITEM","targetId":"<id товара>"}' \
  "https://ваш-домен/api/v1/entity/discount"
```

**Не влияет на фактическую цену** — как и `priceType`, см. `README.md`.

### `customEntityType` — Пользовательские справочники

| Поле | Тип | Доступ | Примечание |
|---|---|---|---|
| `id` | string | R | |
| `name` | string | RW | обязательно |
| `createdAt` | date | R | |

Поиск: `name`. `expand`: `values` (сами значения справочника — управляются
только через `expand`, отдельного типа `customEntityValue` нет).

### `task` — Задачи

| Поле | Тип | Доступ | Примечание |
|---|---|---|---|
| `id` | string | R | |
| `title` | string | RW | обязательно |
| `description` | string | RW | |
| `dueDate` | date | RW | |
| `status` | enum (`OPEN`\|`DONE`) | RW | по умолчанию `OPEN` |
| `assignedEmployeeId` | id → `employee` | RW | |
| `createdById` | id → `employee` | RW | обязательно; настоящий внешний ключ — несуществующий id вернёт `409` |
| `linkedEntityType` | string | RW | необязательная полиморфная привязка к документу (например `"Order"`) — свободная строка, без валидации значений |
| `linkedEntityId` | string | RW | id документа, на который ссылается `linkedEntityType` |
| `completedAt` | date | RW | |
| `createdAt` | date | R | |

Поиск: `title`. `expand`: недоступен.

### `expenseItem` — Статьи расходов

| Поле | Тип | Доступ | Примечание |
|---|---|---|---|
| `id` | string | R | |
| `name` | string | RW | обязательно |
| `createdAt` | date | R | |

Поиск: `name`. `expand`: недоступен. Используется в `cashOrder.expenseItemId`
для категоризации расходов.

### `cashOrder` — Кассовые ордера (вне розничной смены)

| Поле | Тип | Доступ | Примечание |
|---|---|---|---|
| `id` | string | R | |
| `direction` | enum (`IN`\|`OUT`) | RW | обязательно |
| `amount` | number | RW | обязательно |
| `currency` | string | RW | по умолчанию `"RUB"` |
| `counterpartyId` | id → `client` | RW | необязателен (в отличие от `payment`) |
| `expenseItemId` | id → `expenseItem` | RW | осмыслен только для `direction: "OUT"` |
| `comment` | string | RW | |
| `createdById` | id → `employee` | RW | обязательно; настоящий внешний ключ, невалидный id → `409` |
| `createdAt` | date | R | |

Поиск: недоступен. `expand`: `counterparty`, `expenseItem`.

```bash
curl -X POST -H "Authorization: Bearer $API_KEY" -H "Content-Type: application/json" \
  -d '{"direction":"OUT","amount":5000,"expenseItemId":"<id статьи>","createdById":"<id сотрудника>","comment":"Хоз. расходы"}' \
  "https://ваш-домен/api/v1/entity/cashOrder"
```

### `counterpartyAdjustment` — Корректировки баланса контрагента

| Поле | Тип | Доступ | Примечание |
|---|---|---|---|
| `id` | string | R | |
| `clientId` | id → `client` | RW | обязательно |
| `side` | enum (`RECEIVABLE`\|`PAYABLE`) | RW | обязательно — какой из двух независимых балансов клиента (как покупателя/как поставщика) корректируется |
| `amount` | number | RW | обязательно; уменьшает выбранный баланс |
| `comment` | string | RW | |
| `createdById` | id → `employee` | RW | обязательно; настоящий внешний ключ, невалидный id → `409` |
| `createdAt` | date | R | |

Поиск: недоступен. `expand`: `client`.

---

## Документы (`writable: false` — только чтение)

Настоящая бизнес-логика этих типов (нумерация, резервирование склада,
FIFO-списание себестоимости) живёт в Server Actions, привязанных к сессии —
см. `README.md` за полным объяснением, почему запись через API-ключ здесь
не поддерживается.

### `order` — Заказы покупателей

| Поле | Тип | Доступ | Примечание |
|---|---|---|---|
| `id` | string | R | |
| `number` | number | R | порядковый номер заказа |
| `clientId` | id → `client` | R | |
| `assignedEmployeeId` | id → `employee` | R | |
| `contractId` | id → `contract` | R | |
| `salesChannelId` | id → `salesChannel` | R | |
| `legalEntityId` | id → `legalEntity` | R | |
| `storeId` | id → `store` | R | |
| `projectId` | id → `project` | R | |
| `statusId` | id → статус документа | R | |
| `isPosted` | boolean | R | «Проведено» — влияет на остатки, независимо от статуса |
| `isReserved` | boolean | R | «Резерв» — требует `isPosted` + указанный склад |
| `createdAt` | date | R | |

`expand`: `client`, `lineItems`, `status`.

### `purchaseOrder` — Заказы поставщику

| Поле | Тип | Доступ | Примечание |
|---|---|---|---|
| `id` | string | R | |
| `number` | number | R | |
| `supplierId` | id → `client` | R | |
| `assignedEmployeeId` | id → `employee` | R | |
| `contractId` | id → `contract` | R | |
| `legalEntityId` | id → `legalEntity` | R | |
| `statusId` | id → статус документа | R | |
| `createdAt` | date | R | |

`expand`: `supplier`, `lineItems`, `status`, `contract`, `legalEntity`.

### `stockMovement` — Складские движения

| Поле | Тип | Доступ | Примечание |
|---|---|---|---|
| `id` | string | R | |
| `type` | enum (`ENTER`\|`LOSS`\|`MOVE`\|`INVENTORY`\|`DEMAND`\|`SUPPLY`\|`SALES_RETURN`\|`PURCHASE_RETURN`\|`PRODUCTION_CONSUME`\|`PRODUCTION_OUTPUT`\|`RETAIL_SALE`\|`RETAIL_RETURN`) | R | тип движения — определяет, добавляет оно остаток или списывает |
| `number` | number | R | |
| `storeId` | id → `store` | R | склад-источник (или единственный, если не `MOVE`) |
| `toStoreId` | id → `store` | R | склад-назначение, только для `MOVE` |
| `orderId` | id → `order` | R | если движение связано с заказом (`DEMAND`/`SALES_RETURN`) |
| `purchaseOrderId` | id → `purchaseOrder` | R | если движение связано с заказом поставщику (`SUPPLY`/`PURCHASE_RETURN`) |
| `isPosted` | boolean | R | непроведённый черновик не влияет на остатки |
| `postedAt` | date | R | |
| `comment` | string | R | |
| `createdAt` | date | R | |

`expand`: `store`, `toStore`, `lines` (позиции движения).

### `payment` — Платежи

| Поле | Тип | Доступ | Примечание |
|---|---|---|---|
| `id` | string | R | |
| `direction` | enum (`IN`\|`OUT`) | R | |
| `amount` | number | R | |
| `currency` | string | R | |
| `counterpartyId` | id → `client` | R | обязателен (в отличие от `cashOrder`) |
| `orderId` | id → `order` | R | |
| `purchaseOrderId` | id → `purchaseOrder` | R | |
| `invoiceOutId` | id → `invoiceOut` | R | |
| `invoiceInId` | id → `invoiceIn` | R | |
| `method` | enum (`CASH`\|`CARD`) | R | |
| `comment` | string | R | |
| `createdAt` | date | R | |

`expand`: `counterparty`.

### `invoiceOut` — Счета покупателям

| Поле | Тип | Доступ | Примечание |
|---|---|---|---|
| `id` | string | R | |
| `number` | number | R | |
| `clientId` | id → `client` | R | |
| `orderId` | id → `order` | R | если создан из заказа |
| `statusId` | id → статус документа | R | |
| `createdAt` | date | R | |

`expand`: `client`, `lineItems`, `status`.

### `invoiceIn` — Счета поставщиков

| Поле | Тип | Доступ | Примечание |
|---|---|---|---|
| `id` | string | R | |
| `number` | number | R | |
| `supplierId` | id → `client` | R | |
| `purchaseOrderId` | id → `purchaseOrder` | R | если создан из заказа поставщику |
| `statusId` | id → статус документа | R | |
| `createdAt` | date | R | |

`expand`: `supplier`, `lineItems`, `status`.

---

## Журнал изменений

### `auditLog` — Аудит (`writable: false`)

| Поле | Тип | Доступ | Примечание |
|---|---|---|---|
| `id` | string | R | |
| `entityType` | string | R | например `"CatalogItem"`, `"Order"` |
| `entityId` | string | R | |
| `action` | enum (`CREATE`\|`UPDATE`\|`DELETE`) | R | |
| `source` | enum (`UI`\|`API`) | R | **надёжно фиксируется только для `API`** — см. `README.md` |
| `actorUserId` | string | R | |
| `actorLabel` | string | R | человекочитаемое имя того, кто внёс изменение |
| `diff` | object | R | `{поле: {from, to}}` для `UPDATE`, полный снимок для `CREATE`/`DELETE` |
| `createdAt` | date | R | |

Поиск/`expand`: недоступны.

---

## Асинхронный экспорт

`ExportJob` — не относится к реестру сущностей выше, отдельные эндпоинты.
Полное описание синтаксиса — `README.md`, раздел «Асинхронный экспорт».
Кратко:

```
GET /api/v1/entity/{любой тип из реестра выше}?async=true[&filter=...&search=...&order=...]
→ 202 { "id": "...", "status": "PENDING", "meta": { "href": ".../api/v1/export/{id}" } }

GET /api/v1/export/{id}
→ { "id", "entityType", "status": "PENDING" | "DONE" | "FAILED", "rows"?: [...], "error"?: "..." }
```

`rows` (только при `status: "DONE"`) — те же поля и та же проекция, что у
обычного `GET`-списка этого типа, но без пагинации (выгружаются все строки,
подходящие под фильтр).

---

## Изображения и файлы (`Attachment`)

Не экспонированы через этот API — см. `README.md`, раздел «Изображения и
файлы-вложения», за причиной. Управляются и просматриваются только из
интерфейса (карточка товара — галерея, карточки документов — список файлов).

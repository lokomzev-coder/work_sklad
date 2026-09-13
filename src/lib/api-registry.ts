import { prisma } from "@/lib/prisma";
import { priceTypeSchema } from "@/lib/validation/price-type";
import { discountSchema } from "@/lib/validation/discount";
import { assertDiscountTargetBelongsToOrg } from "@/lib/discount-target";

function zodValidate(schema: { safeParse: (input: unknown) => { success: boolean; data?: unknown; error?: { issues: { message: string }[] } } }) {
  return (input: Record<string, unknown>) => {
    const parsed = schema.safeParse(input);
    if (!parsed.success) {
      return { ok: false as const, error: parsed.error?.issues[0]?.message ?? "Неверные данные" };
    }
    return { ok: true as const, data: parsed.data as Record<string, unknown> };
  };
}

/**
 * Block O — registry backing the generic `/api/v1/entity/{type}` route.
 * One entry per exposed Prisma model rather than a hand-written route file
 * per entity (would be ~15 near-identical files). `scalarFields` is a
 * whitelist in both directions: what's returned to the client and — for
 * `writable: true` entries — what's accepted on create/update. Relation
 * fields (Order.lineItems, Client.orders, etc.) are never in this list;
 * they're only reachable via `expand`, deliberately not embedded by
 * default (keeps a plain GET response small and predictable).
 *
 * `writable: false` entries are the "document" models (Order, PurchaseOrder,
 * StockMovement, Payment, InvoiceIn/Out) — these have real business rules
 * live in their existing Server Actions (sequential numbering, status
 * defaults, StockReservation sync, FIFO batch allocation, etc.) that all
 * assume a session-derived OrgContext (`getOrgContext`, next-auth cookies).
 * An API-key request has no session, so a generic Prisma `create` here would
 * silently skip all of that and produce a broken document (e.g. an Order
 * with no OrderStatus, no synced StockReservation). Rather than duplicate or
 * unsafely bypass that logic, write access for documents is deliberately
 * out of this phase — see docs/handbook/api/README.md — read access (list/
 * get) is still useful on its own (e.g. an external BI tool polling orders).
 */
export interface ApiEntityConfig {
  /** The corresponding key on the Prisma client, e.g. `prisma.client`. */
  delegate:
    | "client"
    | "employee"
    | "store"
    | "contract"
    | "project"
    | "salesChannel"
    | "legalEntity"
    | "catalogItem"
    | "catalogItemVariant"
    | "order"
    | "purchaseOrder"
    | "stockMovement"
    | "payment"
    | "invoiceOut"
    | "invoiceIn"
    | "auditLog"
    | "priceType"
    | "discount"
    | "customEntityType"
    | "task"
    | "expenseItem"
    | "cashOrder"
    | "counterpartyAdjustment";
  writable: boolean;
  scalarFields: string[];
  requiredOnCreate: string[];
  searchFields?: string[];
  /** Relation name -> Prisma `include` value, reachable via `?expand=`. */
  expandable?: Record<string, true | { include: Record<string, unknown> }>;
  /**
   * Field name -> its actual scalar type, for `filter` value coercion
   * (lib/api-query.ts). Any field NOT listed here defaults to "string" —
   * this must stay a whitelist of the *exceptions* (numbers/booleans/dates),
   * never the other way around: a digits-only string field like `inn` or
   * `barcode` must never be guessed as a number just because it looks like
   * one (that's exactly the bug this config exists to prevent).
   */
  fieldTypes?: Record<string, "number" | "boolean" | "date">;
  /**
   * Optional cross-field validation beyond the plain `requiredOnCreate`
   * presence check — e.g. Discount's "percentage ≤ 100" and "targetId
   * required unless target is ALL" refinements (lib/validation/
   * discount.ts). Found necessary the hard way: a bare "is field X present"
   * check let a 150% discount and a CLIENT-targeted discount with no client
   * through as 201s. Reuses the same Zod schema the dashboard form uses —
   * one source of truth, not duplicated rules — and returns the *parsed*
   * data (after Zod's own `.transform`/coercion) for the route to write.
   * Not (yet) wired for every writable entity — see ROADMAP.md Block O
   * phase 4 for which ones have it and why the rest don't yet.
   */
  validate?: (input: Record<string, unknown>) => { ok: true; data: Record<string, unknown> } | { ok: false; error: string };
  /**
   * Optional async cross-reference check — for a field that isn't a real
   * Prisma FK (so there's no DB constraint to catch a bogus or cross-org
   * value) and so needs an explicit lookup, e.g. `Discount.targetId`
   * (polymorphic — points at CatalogGroup/CatalogItem/Client depending on
   * `target`). `validate` above is synchronous/pure (Zod only) and can't
   * make this kind of DB call itself. Found necessary the hard way: without
   * this, POSTing a `discount` with a nonexistent `targetId` returned 201.
   */
  asyncValidate?: (orgId: string, data: Record<string, unknown>) => Promise<{ ok: true } | { ok: false; error: string }>;
}

export const ENTITY_REGISTRY: Record<string, ApiEntityConfig> = {
  client: {
    delegate: "client",
    writable: true,
    scalarFields: [
      "id", "name", "inn", "phone", "email", "address", "kpp", "ogrn",
      "bankName", "bankBik", "bankAccount", "status", "createdAt",
    ],
    requiredOnCreate: ["name"],
    searchFields: ["name", "email", "phone", "inn"],
    fieldTypes: { createdAt: "date" },
  },
  employee: {
    delegate: "employee",
    writable: true,
    scalarFields: ["id", "fullName", "position", "email", "phone", "status", "createdAt"],
    requiredOnCreate: ["fullName"],
    searchFields: ["fullName", "email"],
    fieldTypes: { createdAt: "date" },
  },
  store: {
    delegate: "store",
    writable: true,
    scalarFields: ["id", "name", "status", "createdAt"],
    requiredOnCreate: ["name"],
    searchFields: ["name"],
    fieldTypes: { createdAt: "date" },
  },
  contract: {
    delegate: "contract",
    writable: true,
    // number is a free-text String here (e.g. "Б/Н-123"), NOT numeric —
    // deliberately not in fieldTypes, same reasoning as Client.inn.
    scalarFields: ["id", "clientId", "number", "signedAt", "createdAt"],
    requiredOnCreate: ["clientId", "number"],
    expandable: { client: true },
    fieldTypes: { signedAt: "date", createdAt: "date" },
  },
  project: {
    delegate: "project",
    writable: true,
    scalarFields: [
      "id", "name", "clientId", "responsibleEmployeeId", "startDate", "endDate",
      "budget", "currency", "status", "createdAt",
    ],
    requiredOnCreate: ["name"],
    searchFields: ["name"],
    expandable: { client: true, responsibleEmployee: true },
    fieldTypes: { startDate: "date", endDate: "date", budget: "number", createdAt: "date" },
  },
  salesChannel: {
    delegate: "salesChannel",
    writable: true,
    scalarFields: ["id", "name"],
    requiredOnCreate: ["name"],
    searchFields: ["name"],
  },
  legalEntity: {
    delegate: "legalEntity",
    writable: true,
    scalarFields: [
      "id", "name", "inn", "kpp", "ogrn", "address", "bankName", "bankBik",
      "bankAccount", "isDefault", "status", "createdAt",
    ],
    requiredOnCreate: ["name"],
    searchFields: ["name", "inn"],
    fieldTypes: { isDefault: "boolean", createdAt: "date" },
  },
  catalogItem: {
    delegate: "catalogItem",
    writable: true,
    scalarFields: [
      "id", "name", "type", "sku", "barcode", "unitPrice", "currency",
      "unitId", "groupId", "taxRate", "minStock", "status", "createdAt",
    ],
    requiredOnCreate: ["name", "type", "unitPrice"],
    // sku/barcode are digits-heavy strings, deliberately not numeric.
    searchFields: ["name", "sku", "barcode"],
    expandable: { unit: true, group: true, variants: true, prices: { include: { priceType: true } } },
    fieldTypes: { unitPrice: "number", minStock: "number", createdAt: "date" },
  },
  catalogItemVariant: {
    delegate: "catalogItemVariant",
    writable: false,
    scalarFields: ["id", "catalogItemId", "sku", "barcode", "priceOverride", "status", "createdAt"],
    requiredOnCreate: [],
    expandable: { values: { include: { characteristic: true } } },
    fieldTypes: { priceOverride: "number", createdAt: "date" },
  },
  order: {
    delegate: "order",
    writable: false,
    scalarFields: [
      "id", "number", "clientId", "assignedEmployeeId", "contractId",
      "salesChannelId", "legalEntityId", "storeId", "projectId", "statusId",
      "isPosted", "isReserved", "createdAt",
    ],
    requiredOnCreate: [],
    expandable: { client: true, lineItems: true, status: true },
    fieldTypes: { number: "number", isPosted: "boolean", isReserved: "boolean", createdAt: "date" },
  },
  purchaseOrder: {
    delegate: "purchaseOrder",
    writable: false,
    scalarFields: [
      "id", "number", "supplierId", "assignedEmployeeId", "contractId",
      "legalEntityId", "statusId", "createdAt",
    ],
    requiredOnCreate: [],
    expandable: { supplier: true, lineItems: true, status: true, contract: true, legalEntity: true },
    fieldTypes: { number: "number", createdAt: "date" },
  },
  stockMovement: {
    delegate: "stockMovement",
    writable: false,
    scalarFields: [
      "id", "type", "number", "storeId", "toStoreId", "orderId",
      "purchaseOrderId", "isPosted", "postedAt", "comment", "createdAt",
    ],
    requiredOnCreate: [],
    expandable: { store: true, toStore: true, lines: true },
    fieldTypes: { number: "number", isPosted: "boolean", postedAt: "date", createdAt: "date" },
  },
  payment: {
    delegate: "payment",
    writable: false,
    scalarFields: [
      "id", "direction", "amount", "currency", "counterpartyId", "orderId",
      "purchaseOrderId", "invoiceOutId", "invoiceInId", "method", "comment", "createdAt",
    ],
    requiredOnCreate: [],
    expandable: { counterparty: true },
    fieldTypes: { amount: "number", createdAt: "date" },
  },
  invoiceOut: {
    delegate: "invoiceOut",
    writable: false,
    scalarFields: ["id", "number", "clientId", "orderId", "statusId", "createdAt"],
    fieldTypes: { number: "number", createdAt: "date" },
    requiredOnCreate: [],
    expandable: { client: true, lineItems: true, status: true },
  },
  invoiceIn: {
    delegate: "invoiceIn",
    writable: false,
    scalarFields: ["id", "number", "supplierId", "purchaseOrderId", "statusId", "createdAt"],
    requiredOnCreate: [],
    expandable: { supplier: true, lineItems: true, status: true },
    fieldTypes: { number: "number", createdAt: "date" },
  },
  auditLog: {
    delegate: "auditLog",
    writable: false,
    scalarFields: ["id", "entityType", "entityId", "action", "source", "actorUserId", "actorLabel", "diff", "createdAt"],
    requiredOnCreate: [],
    fieldTypes: { createdAt: "date" },
  },
  priceType: {
    delegate: "priceType",
    writable: true,
    scalarFields: ["id", "name", "isDefault", "createdAt"],
    requiredOnCreate: ["name"],
    searchFields: ["name"],
    expandable: { prices: { include: { catalogItem: true } } },
    fieldTypes: { isDefault: "boolean", createdAt: "date" },
    validate: zodValidate(priceTypeSchema),
  },
  discount: {
    delegate: "discount",
    writable: true,
    scalarFields: ["id", "name", "type", "value", "target", "targetId", "startDate", "endDate", "isActive", "createdAt"],
    requiredOnCreate: ["name", "type", "value"],
    searchFields: ["name"],
    fieldTypes: { value: "number", startDate: "date", endDate: "date", isActive: "boolean", createdAt: "date" },
    validate: zodValidate(discountSchema),
    asyncValidate: (orgId, data) =>
      assertDiscountTargetBelongsToOrg(orgId, data.target as string, data.targetId as string | null | undefined),
  },
  // Block O phase 5. CustomEntityValue (the dictionary's actual rows) is
  // deliberately NOT its own top-level type — same "manage via a dedicated
  // action, expose read-only via expand" choice already made for
  // CatalogItemPrice in phase 4 — kept consistent rather than exposing two
  // different management styles for conceptually similar child rows.
  customEntityType: {
    delegate: "customEntityType",
    writable: true,
    scalarFields: ["id", "name", "createdAt"],
    requiredOnCreate: ["name"],
    searchFields: ["name"],
    expandable: { values: true },
    fieldTypes: { createdAt: "date" },
  },
  // createdById/assignedEmployeeId are real Prisma FKs (unlike Discount.
  // targetId) — an invalid id fails Prisma's own FK constraint, caught by
  // the route's existing try/catch and returned as 409, so no asyncValidate
  // needed here.
  task: {
    delegate: "task",
    writable: true,
    scalarFields: [
      "id", "title", "description", "dueDate", "status", "assignedEmployeeId",
      "createdById", "linkedEntityType", "linkedEntityId", "completedAt", "createdAt",
    ],
    requiredOnCreate: ["title", "createdById"],
    searchFields: ["title"],
    fieldTypes: { dueDate: "date", completedAt: "date", createdAt: "date" },
  },
  expenseItem: {
    delegate: "expenseItem",
    writable: true,
    scalarFields: ["id", "name", "createdAt"],
    requiredOnCreate: ["name"],
    searchFields: ["name"],
    fieldTypes: { createdAt: "date" },
  },
  // Block O phase 6. counterpartyId/expenseItemId/createdById are real
  // Prisma FKs — an invalid id fails the DB constraint, caught by the
  // route's existing try/catch and returned as 409 (same reasoning as
  // Task's createdById/assignedEmployeeId in phase 5).
  cashOrder: {
    delegate: "cashOrder",
    writable: true,
    scalarFields: [
      "id", "direction", "amount", "currency", "counterpartyId",
      "expenseItemId", "orderId", "comment", "createdById", "createdAt",
    ],
    requiredOnCreate: ["direction", "amount", "createdById"],
    expandable: { counterparty: true, expenseItem: true, order: true },
    fieldTypes: { amount: "number", createdAt: "date" },
  },
  counterpartyAdjustment: {
    delegate: "counterpartyAdjustment",
    writable: true,
    scalarFields: ["id", "clientId", "side", "amount", "comment", "createdById", "createdAt"],
    requiredOnCreate: ["clientId", "side", "amount", "createdById"],
    expandable: { client: true },
    fieldTypes: { amount: "number", createdAt: "date" },
  },
};

export function getEntityConfig(type: string): ApiEntityConfig | null {
  return ENTITY_REGISTRY[type] ?? null;
}

/**
 * Projects a Prisma row down to `scalarFields` (+ any keys added by
 * `expand`, which aren't in that whitelist since they're relations, not
 * scalars) before it ever reaches a response. Prisma's `create`/`update`/
 * `findFirst` return every column by default — without this step, internal
 * fields never meant to be public (e.g. Client.isWalkIn,
 * Client.assignedEmployeeId, and orgId itself) would leak through.
 */
/**
 * Coerces one write-bound field value using `config.fieldTypes`, the same
 * whitelist `lib/api-query.ts` already uses for `filter`. Found necessary
 * the hard way: Prisma's DateTime columns reject a bare "2026-01-01" date
 * string ("Invalid value... premature end of input. Expected ISO-8601
 * DateTime") — a JSON request body has no native Date type, so a client can
 * only ever send a string, and it must become an actual `Date` before
 * reaching Prisma. Only "date"-typed fields are touched; everything else
 * passes through as-is (JSON's own number/boolean/string types already
 * match what Prisma expects for those).
 */
export function coerceForWrite(field: string, value: unknown, config: ApiEntityConfig): unknown {
  if (config.fieldTypes?.[field] === "date" && typeof value === "string") {
    return new Date(value);
  }
  return value;
}

export function projectRow(row: Record<string, unknown>, config: ApiEntityConfig): Record<string, unknown> {
  const projected: Record<string, unknown> = {};
  for (const field of config.scalarFields) {
    if (field in row) projected[field] = row[field];
  }
  for (const relation of Object.keys(config.expandable ?? {})) {
    if (relation in row) projected[relation] = row[relation];
  }
  return projected;
}

/** Every entry here is org-scoped the same way — a `Prisma.<Model>Delegate`
 * with `orgId` on the model. Cast through `unknown` at the call site: a
 * single registry covering ~15 distinct Prisma delegates can't be expressed
 * without losing static typing somewhere, so the boundary is here, at the
 * one place that does the dynamic dispatch, not scattered across callers. */
export function getDelegate(config: ApiEntityConfig): PrismaDelegate {
  return (prisma as unknown as Record<string, PrismaDelegate>)[config.delegate];
}

export interface PrismaDelegate {
  findMany(args: Record<string, unknown>): Promise<Record<string, unknown>[]>;
  count(args: Record<string, unknown>): Promise<number>;
  findFirst(args: Record<string, unknown>): Promise<Record<string, unknown> | null>;
  create(args: Record<string, unknown>): Promise<Record<string, unknown>>;
  update(args: Record<string, unknown>): Promise<Record<string, unknown>>;
  delete(args: Record<string, unknown>): Promise<Record<string, unknown>>;
}

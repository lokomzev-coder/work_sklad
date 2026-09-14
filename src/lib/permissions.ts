import type { Role } from "@/generated/prisma/enums";
import type { SubscriptionState } from "@/lib/subscription";

/**
 * Block I2.1 — full permission matrix (МойСклад-style). Replaces the old
 * single-ladder `Access` model (see git history / permissions-legacy.ts for
 * the pre-I2.1 shape, still used by not-yet-migrated call sites during the
 * transition). Every resource now has four independent axes instead of one
 * "edit" gate: `view`/`edit` are scope-ranked (who can see/touch which
 * rows), `create`/`delete` are plain booleans.
 */
export type ScopeLevel = "NONE" | "OWN" | "OWN_GROUP" | "ALL";

const SCOPE_RANK: Record<ScopeLevel, number> = { NONE: 0, OWN: 1, OWN_GROUP: 2, ALL: 3 };

export interface ResourcePermission {
  view: ScopeLevel;
  create: boolean;
  edit: ScopeLevel;
  delete: boolean;
}

export type Resource =
  | "dashboard"
  | "reports"
  | "clients"
  | "catalog"
  | "catalogImport"
  | "orders"
  | "purchaseOrders"
  | "invoicesOut"
  | "invoicesIn"
  | "contracts"
  | "payments"
  | "salesChannels"
  | "warehouse"
  | "techCards"
  | "techProcesses"
  | "productionOrders"
  | "employees"
  | "membership"
  | "vault"
  | "documentStatuses"
  | "customFields"
  | "webhooks"
  | "legalEntities"
  | "exchangeRates"
  | "customRoles"
  | "scenarios"
  | "retail"
  | "projects"
  | "apiKeys"
  | "auditLog"
  | "priceTypes"
  | "labelTemplates"
  | "discounts"
  | "tasks"
  | "expenseItems";

/** Only these resources have a real per-row owner (`assignedEmployeeId`) —
 * OWN/OWN_GROUP are meaningful exclusively for them. Every other resource's
 * UI only offers NONE/ALL, but the type stays uniform so the engine never
 * branches on resource identity. */
export const SCOPED_RESOURCES: ReadonlySet<Resource> = new Set([
  "orders",
  "purchaseOrders",
  "productionOrders",
  "clients",
  // Block O phase 5: Task.assignedToId is a real per-row owner, same as the
  // resources above — OWN means "tasks assigned to me".
  "tasks",
]);

// Security fix (external review, 2026-09-13): vault's OWN scope (used by
// the MANAGER default below) means "entries I've been explicitly granted"
// (EmployeeVaultAccess), enforced by lib/vault-scope.ts — a genuinely
// different, per-employee-grant shape than the assignedEmployeeId owner
// SCOPED_RESOURCES/lib/scope.ts model above, and vault has no group concept
// for OWN_GROUP to mean anything distinct from OWN. Deliberately NOT added
// to SCOPED_RESOURCES: that would offer OWN_GROUP in the CustomRole matrix
// editor UI as if it behaved differently from OWN for vault, which it
// doesn't — the editor still only offers NONE/ALL for vault; achieving the
// MANAGER-style grant-scoped tier for a custom role isn't exposed in the UI
// yet, a known follow-up, not a silent gap.

/** Never resolved from a CustomRole override — always the actor's base Role
 * default, full stop. Closes the obvious self-escalation loop: a CustomRole
 * can never grant its own bearer (or anyone else) more power to hand out
 * logins/roles than their base Role already has. See CustomRole's schema
 * comment and resolveCapabilities() below. */
export const NON_OVERRIDABLE_RESOURCES: ReadonlySet<Resource> = new Set(["membership", "customRoles"]);

const NONE_PERM: ResourcePermission = { view: "NONE", create: false, edit: "NONE", delete: false };
const ALL_PERM: ResourcePermission = { view: "ALL", create: true, edit: "ALL", delete: true };
const VIEW_ALL: ResourcePermission = { view: "ALL", create: false, edit: "NONE", delete: false };

function allResources(fill: ResourcePermission): Record<Resource, ResourcePermission> {
  const resources: Resource[] = [
    "dashboard", "reports", "clients", "catalog", "catalogImport",
    "orders", "purchaseOrders", "invoicesOut", "invoicesIn", "contracts", "payments", "salesChannels",
    "warehouse", "techCards", "techProcesses", "productionOrders",
    "employees", "membership", "vault",
    "documentStatuses", "customFields", "webhooks", "legalEntities", "exchangeRates", "customRoles", "scenarios",
    "retail", "projects", "apiKeys", "auditLog", "priceTypes", "discounts",
    "tasks", "expenseItems", "labelTemplates",
  ];
  return Object.fromEntries(resources.map((r) => [r, fill])) as Record<Resource, ResourcePermission>;
}

/**
 * Default per-role matrix — 1:1 behavioral carry-over from the pre-I2.1
 * ladder model (see permissions-legacy.ts), just expressed on the finer
 * resource/action split. Not silently tightened or loosened versus what
 * each role could already do; anything genuinely new (dashboard/reports
 * gates) is called out inline below.
 */
export const CAPABILITIES: Record<Role, Record<Resource, ResourcePermission>> = {
  ADMIN: allResources(ALL_PERM),
  MANAGER: {
    ...allResources(ALL_PERM),
    // Security fix (external review, 2026-09-13): vault access is an
    // explicit per-entry grant (EmployeeVaultAccess), not a blanket "can
    // see the resource" toggle — a role resolving to ALL here bypassed
    // every grant and revealed every organization's secrets. OWN is
    // enforced by lib/vault-scope.ts (checked explicitly at every read/
    // reveal/mutate call site, since vault has no assignedEmployeeId for
    // the generic lib/scope.ts helpers to key off). ADMIN intentionally
    // stays ALL — the one account meant to see everything unconditionally,
    // same principle as the platform-admin owner elsewhere in this project.
    vault: { view: "OWN", create: true, edit: "OWN", delete: true },
    membership: VIEW_ALL, // legacy: membership "read"
    // legacy: settings "read" — MANAGER could see but not edit any of these 6.
    documentStatuses: VIEW_ALL,
    customFields: VIEW_ALL,
    webhooks: VIEW_ALL,
    legalEntities: VIEW_ALL,
    exchangeRates: VIEW_ALL,
    customRoles: VIEW_ALL,
    scenarios: VIEW_ALL,
    // Block O: same "see but can't touch" tier as the other admin-only
    // settings above — an API key grants full org-wide access (equivalent
    // to ADMIN), so only ADMIN can generate/revoke one.
    apiKeys: VIEW_ALL,
    // Block O phase 3: same tier as apiKeys/webhooks/etc above.
    auditLog: VIEW_ALL,
  },
  EMPLOYEE: {
    ...allResources(NONE_PERM),
    dashboard: VIEW_ALL, // new gate — was ungated before, EMPLOYEE already saw it in practice
    clients: ALL_PERM, // legacy: clients "edit"
    catalog: VIEW_ALL, // legacy: catalog "read"
    // legacy: orders "edit" gated ALL FIVE of these as one resource — full
    // parity means EMPLOYEE could edit contracts/payments/salesChannels too,
    // not just orders/purchaseOrders. Deliberately not tightened here (see
    // module comment) — revisit as its own explicit decision later if this
    // default should genuinely narrow.
    orders: ALL_PERM,
    purchaseOrders: ALL_PERM,
    // Block O phase 5: a shared collaboration tool, not a sensitive lever
    // like apiKeys/auditLog/priceTypes/discounts — every employee can see
    // and manage tasks (their own or others'), same bucket as orders above.
    tasks: ALL_PERM,
    // Block M5: same bucket as orders/purchaseOrders/payments — an invoice
    // is a side artifact of a document this role can already fully edit,
    // using money-recording capability it already has via `payments`, not a
    // new authority boundary of its own.
    invoicesOut: ALL_PERM,
    invoicesIn: ALL_PERM,
    contracts: ALL_PERM,
    payments: ALL_PERM,
    salesChannels: ALL_PERM,
    // Order redesign: same bucket as contracts/salesChannels — an
    // order-adjacent tag this role can already fully edit via `orders`.
    projects: ALL_PERM,
    warehouse: VIEW_ALL, // legacy: warehouse "read"
    // legacy: production "read" gated techCards/techProcesses/productionOrders together.
    techCards: VIEW_ALL,
    techProcesses: VIEW_ALL,
    productionOrders: VIEW_ALL,
    employees: VIEW_ALL, // legacy: employees "read"
  },
  // Block F3: floor worker — locked to the /floor interface (layout gates in
  // (dashboard)/[org]/layout.tsx and (floor)/[org]/floor/layout.tsx), so
  // NONE everywhere else is enforced by routing, not just this table.
  PRODUCTION: {
    ...allResources(NONE_PERM),
    // legacy: production "edit" gated techCards/techProcesses/productionOrders
    // as one resource — full parity grants all three (unreachable via UI
    // today since /floor exposes no tech-card/tech-process pages, same as
    // the vault route being plumbing-only while hard-disabled). Tightening
    // this to just productionOrders is a real, separate design decision —
    // not done silently here, see module comment.
    techCards: ALL_PERM,
    techProcesses: ALL_PERM,
    productionOrders: ALL_PERM,
  },
  // Block E: kassa-only role — locked to the /kassa interface (layout gates
  // in (dashboard)/[org]/layout.tsx and (kassa)/[org]/kassa/layout.tsx),
  // same pattern as PRODUCTION/floor. Unlike PRODUCTION, ADMIN is NOT
  // excluded from /kassa (explicit user requirement — an org's admin/owner
  // reaches every function, including the kassa interface) — that's a
  // route-gate detail, not a capabilities-table one, since ADMIN already
  // gets retail: ALL_PERM for free via its own allResources(ALL_PERM).
  CASHIER: {
    ...allResources(NONE_PERM),
    retail: ALL_PERM,
  },
};

/**
 * New shape of `CustomRole.permissions`. Only resources explicitly present
 * are overridden; everything else falls back to the assigned Membership's
 * base Role default (see resolveCapabilities). Unlike the pre-I2.1 model,
 * an override can grant OR restrict relative to the base Role — it's not a
 * ceiling, it's authoritative for whatever it configures (except
 * NON_OVERRIDABLE_RESOURCES, which never come from here).
 */
export interface CustomRolePermissionsV2 {
  version: 2;
  resources: Partial<Record<Resource, ResourcePermission>>;
}

function isScopeLevel(v: unknown): v is ScopeLevel {
  return v === "NONE" || v === "OWN" || v === "OWN_GROUP" || v === "ALL";
}

function sanitizeResourcePermission(raw: unknown): ResourcePermission | null {
  if (!raw || typeof raw !== "object") return null;
  const obj = raw as Record<string, unknown>;
  if (!isScopeLevel(obj.view) || !isScopeLevel(obj.edit)) return null;
  if (typeof obj.create !== "boolean" || typeof obj.delete !== "boolean") return null;
  return { view: obj.view, edit: obj.edit, create: obj.create, delete: obj.delete };
}

/** Legacy pre-Block-I2.1 shape (see permissions-legacy.ts) — only ever
 * populated `orders`/`purchaseOrders`/`production` scope, nothing else, and
 * never distinguished create/edit/delete (a bare "edit"-level grant implied
 * all three). Translated on read, never written again once a role is saved
 * through the new UI. */
interface CustomRolePermissionsV1Shape {
  orders?: { scope?: unknown };
  purchaseOrders?: { scope?: unknown };
  production?: { scope?: unknown };
}

function fromLegacyScope(scope: unknown): ResourcePermission | null {
  if (scope !== "ALL" && scope !== "OWN") return null;
  return { view: scope, create: true, edit: scope, delete: true };
}

function migrateLegacyPermissions(raw: CustomRolePermissionsV1Shape): CustomRolePermissionsV2 {
  const resources: CustomRolePermissionsV2["resources"] = {};
  const orders = fromLegacyScope(raw.orders?.scope);
  const purchaseOrders = fromLegacyScope(raw.purchaseOrders?.scope);
  const production = fromLegacyScope(raw.production?.scope);
  if (orders) resources.orders = orders;
  if (purchaseOrders) resources.purchaseOrders = purchaseOrders;
  if (production) resources.productionOrders = production;
  return { version: 2, resources };
}

/** Defensive JSON parse — a bad/empty/legacy `permissions` value degrades to
 * "no override" (or a best-effort legacy translation) rather than throwing,
 * so a bad row never 500s a page. */
export function parseCustomRolePermissions(raw: unknown): CustomRolePermissionsV2 {
  if (!raw || typeof raw !== "object") return { version: 2, resources: {} };
  const obj = raw as Record<string, unknown>;
  if (obj.version === 2 && obj.resources && typeof obj.resources === "object") {
    const resources: CustomRolePermissionsV2["resources"] = {};
    for (const [key, value] of Object.entries(obj.resources as Record<string, unknown>)) {
      const perm = sanitizeResourcePermission(value);
      if (perm) resources[key as Resource] = perm;
    }
    return { version: 2, resources };
  }
  return migrateLegacyPermissions(obj as CustomRolePermissionsV1Shape);
}

/** Merges a CustomRole override onto the base Role's default table.
 * NON_OVERRIDABLE_RESOURCES are always read straight from CAPABILITIES,
 * regardless of what the override contains. */
export function resolveCapabilities(
  role: Role,
  override: CustomRolePermissionsV2 | null,
): Record<Resource, ResourcePermission> {
  const base = CAPABILITIES[role];
  if (!override) return base;
  const resolved = { ...base };
  for (const [resource, perm] of Object.entries(override.resources) as [Resource, ResourcePermission][]) {
    if (NON_OVERRIDABLE_RESOURCES.has(resource)) continue;
    resolved[resource] = perm;
  }
  return resolved;
}

export type Action = "view" | "create" | "edit" | "delete";

interface CapabilitiesCtx {
  capabilities: Record<Resource, ResourcePermission>;
  /** Блок Q — set by getOrgContext(). Optional here only so existing
   * call sites/tests that construct a bare {capabilities} object don't
   * need updating; assertPermission treats "not provided" the same as
   * "not RESTRICTED" (never retroactively blocks a caller that doesn't
   * know about subscriptions at all). */
  subscriptionState?: SubscriptionState;
}

/**
 * `need` only applies to view/edit (scope-ranked); defaults to "OWN" — i.e.
 * "at least enough to see/touch your own rows", the same bar as "not NONE"
 * for unscoped resources. Pass "ALL" explicitly where a check specifically
 * means "can see/edit every row", not just "can see/edit something".
 */
export function can(ctx: CapabilitiesCtx, resource: Resource, action: Action, need: ScopeLevel = "OWN"): boolean {
  const perm = ctx.capabilities[resource];
  if (action === "create") return perm.create;
  if (action === "delete") return perm.delete && SCOPE_RANK[perm.edit] >= SCOPE_RANK[need];
  return SCOPE_RANK[perm[action]] >= SCOPE_RANK[need];
}

export function assertPermission(
  ctx: CapabilitiesCtx,
  resource: Resource,
  action: Action,
  need: ScopeLevel = "OWN",
) {
  // Блок Q — single choke point for the subscription gate: every
  // create/edit/delete in the app already routes through this function
  // (Block I), so the check lives here once instead of at every call site.
  // "view" is deliberately exempt — a RESTRICTED org keeps read access,
  // only mutations are blocked. Billing actions themselves (paying an
  // invoice, topping up a balance) never call assertPermission at all —
  // they gate on ctx.role === "ADMIN" directly, precisely so a RESTRICTED
  // org can still pay its way out of RESTRICTED.
  if (action !== "view" && ctx.subscriptionState?.kind === "RESTRICTED") {
    throw new Error(
      "Доступ к изменению данных ограничен — подписка не активна. Оформите тариф в Настройки → Подписка.",
    );
  }
  if (!can(ctx, resource, action, need)) {
    throw new Error(`Недостаточно прав: для "${resource}.${action}" требуется уровень "${need}"`);
  }
}

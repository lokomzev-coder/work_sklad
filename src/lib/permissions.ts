import type { Role } from "@/generated/prisma/enums";

export type Access = "none" | "read" | "edit" | "full";

export type Resource =
  | "vault"
  | "employees"
  | "clients"
  | "catalog"
  | "orders"
  | "membership"
  | "warehouse"
  | "settings";

/** ALL sees every document regardless of who's assigned; OWN sees only its
 * own (Block I) — only meaningful for "orders" right now (assignedEmployeeId
 * is the only resource with a natural per-employee owner). */
export type Scope = "ALL" | "OWN";

const RANK: Record<Access, number> = { none: 0, read: 1, edit: 2, full: 3 };

const CAPABILITIES: Record<Role, Record<Resource, Access>> = {
  ADMIN: {
    vault: "full",
    employees: "full",
    clients: "full",
    catalog: "full",
    orders: "full",
    membership: "full",
    warehouse: "full",
    settings: "full",
  },
  MANAGER: {
    vault: "full",
    employees: "edit",
    clients: "full",
    catalog: "full",
    orders: "full",
    membership: "read",
    warehouse: "full",
    settings: "read",
  },
  EMPLOYEE: {
    vault: "none",
    employees: "read",
    clients: "edit",
    catalog: "read",
    orders: "edit",
    membership: "none",
    warehouse: "read",
    settings: "none",
  },
};

export function can(role: Role, resource: Resource, need: Access): boolean {
  return RANK[CAPABILITIES[role][resource]] >= RANK[need];
}

export function assertPermission(
  role: Role,
  resource: Resource,
  need: Access,
) {
  if (!can(role, resource, need)) {
    throw new Error(
      `Недостаточно прав: для "${resource}" требуется уровень "${need}", у роли ${role} его нет`,
    );
  }
}

/**
 * Shape of CustomRole.permissions (Block I) — deliberately narrow, only
 * "orders" carries a `scope`, since assignedEmployeeId is the only resource
 * with a natural per-employee owner right now (see schema.prisma comment on
 * CustomRole). A custom role only NARROWS what its base Role already allows
 * (e.g. an EMPLOYEE role with "orders: edit" can be scoped to OWN) — it
 * never grants access the base Role doesn't already have.
 */
export interface CustomRolePermissions {
  orders?: { scope: Scope };
}

/** Defensive JSON parse — an empty/malformed `permissions` value degrades to
 * "no scope override" rather than throwing, so a bad row never 500s a page. */
export function parseCustomRolePermissions(raw: unknown): CustomRolePermissions {
  if (!raw || typeof raw !== "object") return {};
  const obj = raw as Record<string, unknown>;
  const orders = obj.orders as { scope?: unknown } | undefined;
  const scope = orders?.scope === "OWN" || orders?.scope === "ALL" ? orders.scope : undefined;
  return scope ? { orders: { scope } } : {};
}

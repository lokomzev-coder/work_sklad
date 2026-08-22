import type { Role } from "@/generated/prisma/enums";

export type Access = "none" | "read" | "edit" | "full";

export type Resource =
  | "vault"
  | "employees"
  | "clients"
  | "catalog"
  | "orders"
  | "membership"
  | "warehouse";

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
  },
  MANAGER: {
    vault: "full",
    employees: "edit",
    clients: "full",
    catalog: "full",
    orders: "full",
    membership: "read",
    warehouse: "full",
  },
  EMPLOYEE: {
    vault: "none",
    employees: "read",
    clients: "edit",
    catalog: "read",
    orders: "edit",
    membership: "none",
    warehouse: "read",
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

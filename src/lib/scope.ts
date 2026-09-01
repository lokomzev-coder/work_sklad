import { cache } from "react";
import { prisma } from "@/lib/prisma";
import type { Resource } from "@/lib/permissions";
import type { OrgContext } from "@/lib/tenant";

/** The only resources with a real per-row `assignedEmployeeId` owner — see
 * SCOPED_RESOURCES in lib/permissions.ts (kept as a separate, narrower type
 * here so OWNER_LOOKUP below is exhaustive over exactly these four). */
export type ScopedResource = "orders" | "purchaseOrders" | "productionOrders" | "clients";

const OWNER_LOOKUP: Record<
  ScopedResource,
  (id: string, orgId: string) => Promise<{ assignedEmployeeId: string | null } | null>
> = {
  orders: (id, orgId) => prisma.order.findFirst({ where: { id, orgId }, select: { assignedEmployeeId: true } }),
  purchaseOrders: (id, orgId) =>
    prisma.purchaseOrder.findFirst({ where: { id, orgId }, select: { assignedEmployeeId: true } }),
  productionOrders: (id, orgId) =>
    prisma.productionOrder.findFirst({ where: { id, orgId }, select: { assignedEmployeeId: true } }),
  clients: (id, orgId) => prisma.client.findFirst({ where: { id, orgId }, select: { assignedEmployeeId: true } }),
};

/** Memoized per-request (React `cache()`, Next 16 Server Components) — a
 * page that both builds a list `where` and later scope-guards a mutation on
 * the same resource in one request doesn't re-query group membership. */
export const resolveGroupMemberIds = cache(async (orgId: string, groupId: string): Promise<string[]> => {
  const rows = await prisma.employee.findMany({ where: { orgId, groupId }, select: { id: true } });
  return rows.map((r) => r.id);
});

/**
 * Row-level guard for a single-record mutation — replaces the pre-I2.1
 * `assertOwnOrderScope`/`assertOwnProductionScope`/`assertOwnPurchaseOrderScope`
 * (one copy-pasted function per resource) with one generic implementation
 * covering all four SCOPED_RESOURCES, including the new OWN_GROUP level.
 * Call AFTER `assertPermission(ctx, resource, "edit")` has already confirmed
 * the actor has *some* edit access — this only narrows to "on this specific
 * row".
 */
export async function assertRowScope(ctx: OrgContext, resource: ScopedResource, recordId: string): Promise<void> {
  const scope = ctx.capabilities[resource as Resource].edit;
  if (scope === "ALL") return;
  if (scope === "NONE") throw new Error(`Недостаточно прав: "${resource}" недоступен`);

  const record = await OWNER_LOOKUP[resource](recordId, ctx.orgId);
  if (!record) throw new Error("Запись не найдена");

  if (scope === "OWN") {
    if (record.assignedEmployeeId !== ctx.employeeId) {
      throw new Error("Недостаточно прав: эта запись назначена не вам");
    }
    return;
  }

  // OWN_GROUP
  if (!ctx.groupId || !record.assignedEmployeeId) {
    throw new Error("Недостаточно прав: эта запись назначена не вам");
  }
  const memberIds = await resolveGroupMemberIds(ctx.orgId, ctx.groupId);
  if (!memberIds.includes(record.assignedEmployeeId)) {
    throw new Error("Недостаточно прав: эта запись вне вашего отдела");
  }
}

/**
 * Detail-page visibility check for an already-fetched record — pages use
 * this with `notFound()` (not a thrown Error, unlike assertRowScope, which
 * guards mutations). Checks the `view` scope, not `edit`.
 */
export async function isRowVisible(
  ctx: OrgContext,
  resource: ScopedResource,
  ownerEmployeeId: string | null,
): Promise<boolean> {
  const scope = ctx.capabilities[resource as Resource].view;
  if (scope === "ALL") return true;
  if (scope === "NONE") return false;
  if (scope === "OWN") return ownerEmployeeId === ctx.employeeId;
  // OWN_GROUP
  if (!ctx.groupId || !ownerEmployeeId) return false;
  const memberIds = await resolveGroupMemberIds(ctx.orgId, ctx.groupId);
  return memberIds.includes(ownerEmployeeId);
}

/**
 * List-page `where` fragment for a scoped resource's `view` permission. No
 * extra query for ALL/OWN (OWN just reuses `ctx.employeeId`, already in
 * memory) — the one extra query only fires for OWN_GROUP, and only for
 * pages that actually reach that branch.
 */
export async function buildScopeWhere(
  ctx: OrgContext,
  resource: ScopedResource,
): Promise<{ assignedEmployeeId?: string | { in: string[] } }> {
  const scope = ctx.capabilities[resource as Resource].view;
  if (scope === "ALL") return {};
  if (scope === "OWN") return { assignedEmployeeId: ctx.employeeId ?? "__none__" };
  if (scope === "OWN_GROUP") {
    const memberIds = ctx.groupId ? await resolveGroupMemberIds(ctx.orgId, ctx.groupId) : [];
    return { assignedEmployeeId: { in: memberIds.length ? memberIds : ["__none__"] } };
  }
  // NONE somehow reached the query builder — the page's own `can(ctx,
  // resource, "view")` notFound() gate should already have blocked this;
  // return an impossible filter rather than throwing here.
  return { assignedEmployeeId: "__none__" };
}

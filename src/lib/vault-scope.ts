import { prisma } from "@/lib/prisma";
import type { OrgContext } from "@/lib/tenant";

/**
 * Security fix (external review, 2026-09-13) — vault has no single
 * `assignedEmployeeId` owner the way lib/scope.ts's five ScopedResources
 * do; access is instead an explicit many-to-many grant
 * (`EmployeeVaultAccess`, created/removed via grantVaultAccess/
 * revokeVaultAccess in actions/vault.ts). Any `view`/`edit` scope narrower
 * than `ALL` — `OWN` or `OWN_GROUP`, vault has no group concept so both
 * collapse to the same check — means "only entries this employee has been
 * explicitly granted", never "entries they created" or "their
 * department's". Previously nothing consulted `EmployeeVaultAccess` at
 * read/reveal time at all — the grant/revoke UI was decorative for anyone
 * whose role resolved to `ALL` (the previous MANAGER default), letting
 * them see and reveal every secret in the org regardless of what had
 * actually been granted.
 */
export async function canAccessVaultEntry(
  ctx: OrgContext,
  entryId: string,
  action: "view" | "edit" = "view",
): Promise<boolean> {
  const scope = ctx.capabilities.vault[action];
  if (scope === "NONE") return false;
  if (scope === "ALL") return true;
  if (!ctx.employeeId) return false;
  const grant = await prisma.employeeVaultAccess.findUnique({
    where: { employeeId_vaultEntryId: { employeeId: ctx.employeeId, vaultEntryId: entryId } },
  });
  return grant != null;
}

/** List-page `where` fragment, same idea as lib/scope.ts::buildScopeWhere
 * but keyed off the grant table instead of `assignedEmployeeId`. */
export function buildVaultScopeWhere(ctx: OrgContext) {
  const scope = ctx.capabilities.vault.view;
  if (scope === "ALL") return {};
  if (scope === "NONE" || !ctx.employeeId) return { id: "__none__" };
  return { accessGrants: { some: { employeeId: ctx.employeeId } } };
}

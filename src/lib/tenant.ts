import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import type { Role } from "@/generated/prisma/enums";
import type { Resource, ResourcePermission } from "@/lib/permissions";
import { parseCustomRolePermissions, resolveCapabilities } from "@/lib/permissions";

export interface OrgContext {
  orgId: string;
  orgSlug: string;
  orgName: string;
  role: Role;
  userId: string;
  /** Set only if this login is linked to an Employee record (Block I
   * self-service) — null for the common case of a login with no matching
   * employee row. */
  employeeId: string | null;
  /** Block I2.1: this employee's department, if any — powers OWN_GROUP
   * scope (lib/scope.ts::resolveGroupMemberIds). Null if unassigned or no
   * linked Employee at all. */
  groupId: string | null;
  /** Set only if this Membership has a CustomRole assigned — used both to
   * resolve `capabilities` (below) and as one of the three who-can-transition
   * axes on DocumentStatusTransition (Block K). */
  customRoleId: string | null;
  /** True if the assigned CustomRole is a hidden "individual settings" role
   * (Block I2.1) rather than a named, reusable one — drives the toggle
   * default on the employee's Access card. */
  isIndividualRole: boolean;
  /** Block I2.1: fully resolved per-resource permissions for this request —
   * base Role defaults merged with the assigned CustomRole's overrides (see
   * resolveCapabilities in lib/permissions.ts). This is what `can()`/
   * `assertPermission()` read; computed once per request, zero extra
   * queries beyond what this function already runs. */
  capabilities: Record<Resource, ResourcePermission>;
  /** Block I2.2: this employee's default store, if any — a UI convenience
   * to pre-fill store selectors on new documents, not an access boundary. */
  defaultStoreId: string | null;
  /** Block I2.4: this employee's personal default legal entity, if set,
   * else the org's single `LegalEntity.isDefault` row, else null — same
   * cascading-default idea МойСклад uses (personal setting overrides the
   * org default). Pre-fills the legalEntityId selector on new Order/
   * PurchaseOrder documents; never enforced. */
  defaultLegalEntityId: string | null;
}

export async function getOrgContext(orgSlug: string): Promise<OrgContext> {
  const session = await auth();
  if (!session?.user) {
    redirect("/login");
  }

  const membership = session.memberships.find((m) => m.orgSlug === orgSlug);
  if (!membership) {
    redirect("/org-select");
  }

  // Queried fresh (not cached in the JWT) so a scope/role change an admin
  // makes to a CustomRole takes effect on the very next request, not only
  // after the affected user's session token refreshes.
  const fullMembership = await prisma.membership.findFirst({
    where: { userId: session.user.id, orgId: membership.orgId },
    select: {
      employeeId: true,
      customRole: { select: { id: true, isIndividual: true, permissions: true } },
      employee: { select: { defaultStoreId: true, defaultLegalEntityId: true, groupId: true } },
    },
  });

  const override = fullMembership?.customRole
    ? parseCustomRolePermissions(fullMembership.customRole.permissions)
    : null;
  const capabilities = resolveCapabilities(membership.role, override);

  let defaultLegalEntityId = fullMembership?.employee?.defaultLegalEntityId ?? null;
  if (!defaultLegalEntityId) {
    const orgDefault = await prisma.legalEntity.findFirst({
      where: { orgId: membership.orgId, isDefault: true, status: "ACTIVE" },
      select: { id: true },
    });
    defaultLegalEntityId = orgDefault?.id ?? null;
  }

  return {
    orgId: membership.orgId,
    orgSlug: membership.orgSlug,
    orgName: membership.orgName,
    role: membership.role,
    userId: session.user.id,
    employeeId: fullMembership?.employeeId ?? null,
    groupId: fullMembership?.employee?.groupId ?? null,
    customRoleId: fullMembership?.customRole?.id ?? null,
    isIndividualRole: fullMembership?.customRole?.isIndividual ?? false,
    capabilities,
    defaultStoreId: fullMembership?.employee?.defaultStoreId ?? null,
    defaultLegalEntityId,
  };
}

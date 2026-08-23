import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import type { Role } from "@/generated/prisma/enums";
import type { Scope } from "@/lib/permissions";
import { parseCustomRolePermissions } from "@/lib/permissions";

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
  /** Resolved from CustomRole.permissions when a custom role is assigned to
   * this Membership, else "ALL" (the base Role enum has no scope concept —
   * everyone with "orders" access sees every order). */
  orderScope: Scope;
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
    select: { employeeId: true, customRole: { select: { permissions: true } } },
  });

  const orderScope = fullMembership?.customRole
    ? parseCustomRolePermissions(fullMembership.customRole.permissions).orders?.scope ?? "ALL"
    : "ALL";

  return {
    orgId: membership.orgId,
    orgSlug: membership.orgSlug,
    orgName: membership.orgName,
    role: membership.role,
    userId: session.user.id,
    employeeId: fullMembership?.employeeId ?? null,
    orderScope,
  };
}

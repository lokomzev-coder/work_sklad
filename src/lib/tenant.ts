import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import type { Role } from "@/generated/prisma/enums";

export interface OrgContext {
  orgId: string;
  orgSlug: string;
  orgName: string;
  role: Role;
  userId: string;
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

  return {
    orgId: membership.orgId,
    orgSlug: membership.orgSlug,
    orgName: membership.orgName,
    role: membership.role,
    userId: session.user.id,
  };
}

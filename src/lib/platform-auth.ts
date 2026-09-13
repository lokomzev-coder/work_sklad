import { redirect } from "next/navigation";
import { adminAuth } from "@/lib/admin-auth";
import { prisma } from "@/lib/prisma";
import { getAdminBasePath } from "@/lib/admin-path";

// Re-exported for existing call sites that import this from here — the
// actual definition moved to lib/admin-path.ts (see that file's comment)
// to avoid a lib/admin-auth.ts <-> lib/platform-auth.ts import cycle.
export { getAdminBasePath };

/**
 * Блок L — capability flags for the developer/platform admin panel. Kept
 * deliberately flat (no OWN/OWN_GROUP/ALL scope levels like the org-side
 * `Resource`/`ResourcePermission` in lib/permissions.ts) — there's no
 * per-row "owner" concept at the platform level, only "can act on this
 * platform-wide resource or not".
 */
export type PlatformCapability =
  | "viewOrganizations"
  | "manageSubscriptions"
  | "manageAdmins"
  | "viewAuditLog";

export const PLATFORM_CAPABILITIES: readonly PlatformCapability[] = [
  "viewOrganizations",
  "manageSubscriptions",
  "manageAdmins",
  "viewAuditLog",
];

/** Fail-closed: any key missing or not strictly `true` in the stored JSON
 * blob is treated as denied — a corrupted/incomplete PlatformRole.permissions
 * row must never silently grant access. */
export function parsePlatformRolePermissions(raw: unknown): Record<PlatformCapability, boolean> {
  const obj = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const result = {} as Record<PlatformCapability, boolean>;
  for (const capability of PLATFORM_CAPABILITIES) {
    result[capability] = obj[capability] === true;
  }
  return result;
}

export interface PlatformAdminContext {
  platformAdminId: string;
  email: string;
  name: string;
  isOwner: boolean;
  capabilities: Record<PlatformCapability, boolean>;
}

/**
 * Analogue of `lib/tenant.ts::getOrgContext`, for the platform side. Reads
 * the SEPARATE admin session (lib/admin-auth.ts, its own cookie) — never
 * the org session (lib/auth.ts). Capabilities are re-read from the DB on
 * every call (not cached in the JWT), same reasoning as getOrgContext: a
 * role change must take effect immediately, not only after the affected
 * admin's token refreshes — doubly important here, since this is the
 * mechanism by which access gets revoked in an incident.
 */
export async function getPlatformAdminContext(): Promise<PlatformAdminContext> {
  const session = await adminAuth();
  if (!session?.user?.id) {
    redirect(`${getAdminBasePath()}/login`);
  }

  const admin = await prisma.platformAdmin.findFirst({
    where: { id: session.user.id, status: "ACTIVE" },
    include: { platformRole: true },
  });
  if (!admin) {
    // Deleted/deactivated since the session was issued — no grace period.
    redirect(`${getAdminBasePath()}/login`);
  }

  const capabilities = admin.isOwner
    ? PLATFORM_CAPABILITIES.reduce(
        (acc, c) => ({ ...acc, [c]: true }),
        {} as Record<PlatformCapability, boolean>,
      )
    : parsePlatformRolePermissions(admin.platformRole?.permissions);

  return {
    platformAdminId: admin.id,
    email: admin.email,
    name: admin.name,
    isOwner: admin.isOwner,
    capabilities,
  };
}

/** Throws (never silently returns) if the current platform admin lacks
 * `capability` — same fail-loud convention as
 * lib/permissions.ts::assertPermission on the org side. */
export function assertPlatformPermission(ctx: PlatformAdminContext, capability: PlatformCapability): void {
  if (!ctx.capabilities[capability]) {
    throw new Error("Недостаточно прав в панели разработчика");
  }
}

import { prisma } from "@/lib/prisma";
import { getPlatformAdminContext, assertPlatformPermission } from "@/lib/platform-auth";
import { PlatformAdminsManager } from "@/components/admin/platform-admins-manager";

export default async function PlatformAdminsPage() {
  const ctx = await getPlatformAdminContext();
  assertPlatformPermission(ctx, "manageAdmins");

  const [admins, roles] = await Promise.all([
    prisma.platformAdmin.findMany({ orderBy: { createdAt: "asc" } }),
    prisma.platformRole.findMany({ orderBy: { name: "asc" } }),
  ]);

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-2xl font-semibold">Платформенные администраторы</h1>
      <PlatformAdminsManager
        currentAdminId={ctx.platformAdminId}
        admins={admins.map((a) => ({
          id: a.id,
          email: a.email,
          name: a.name,
          isOwner: a.isOwner,
          status: a.status,
          platformRoleId: a.platformRoleId,
          hasCompletedSetup: a.totpEnabledAt !== null,
          lastLoginAt: a.lastLoginAt ? a.lastLoginAt.toLocaleString("ru-RU") : null,
        }))}
        roles={roles.map((r) => ({ id: r.id, name: r.name }))}
      />
    </div>
  );
}

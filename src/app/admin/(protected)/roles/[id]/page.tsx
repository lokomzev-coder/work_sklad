import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import {
  getPlatformAdminContext,
  assertPlatformPermission,
  PLATFORM_CAPABILITIES,
  getAdminBasePath,
} from "@/lib/platform-auth";
import { Card, CardContent } from "@/components/ui/card";
import { PlatformRoleForm } from "@/components/admin/platform-role-form";
import { DeletePlatformRoleButton } from "@/components/admin/delete-platform-role-button";

export default async function PlatformRoleEditPage({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await getPlatformAdminContext();
  assertPlatformPermission(ctx, "manageAdmins");
  const { id } = await params;

  const role = await prisma.platformRole.findUnique({ where: { id } });
  if (!role) {
    notFound();
  }

  return (
    <div className="flex max-w-lg flex-col gap-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Роль: {role.name}</h1>
        <DeletePlatformRoleButton id={role.id} adminBasePath={getAdminBasePath()} />
      </div>
      <Card>
        <CardContent className="pt-6">
          <PlatformRoleForm
            capabilities={[...PLATFORM_CAPABILITIES]}
            role={{ id: role.id, name: role.name, permissions: role.permissions as Record<string, boolean> }}
          />
        </CardContent>
      </Card>
    </div>
  );
}

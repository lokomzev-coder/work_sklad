import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getOrgContext } from "@/lib/tenant";
import { can, parseCustomRolePermissions } from "@/lib/permissions";
import { SettingsSubnav } from "@/components/settings/settings-subnav";
import { CustomRolesManager } from "@/components/settings/custom-roles-manager";

export default async function RolesPage({
  params,
}: {
  params: Promise<{ org: string }>;
}) {
  const { org } = await params;
  const ctx = await getOrgContext(org);
  if (!can(ctx.role, "settings", "read")) notFound();

  const roles = await prisma.customRole.findMany({
    where: { orgId: ctx.orgId },
    orderBy: { name: "asc" },
    include: { _count: { select: { memberships: true } } },
  });

  return (
    <div className="flex flex-col gap-6">
      <SettingsSubnav org={org} active="roles" />
      <div>
        <h1 className="text-2xl font-semibold">Роли доступа</h1>
        <p className="text-sm text-muted-foreground">
          Пользовательские роли сужают видимость заказов сотрудника до только назначенных на него
          («личный кабинет»). Назначьте роль сотруднику на карточке сотрудника, в разделе «Доступ в
          систему». Роль не расширяет права базовой роли (администратор/менеджер/сотрудник) — только
          сужает видимость заказов.
        </p>
      </div>
      <CustomRolesManager
        orgSlug={org}
        roles={roles.map((r) => ({
          id: r.id,
          name: r.name,
          ordersScope: parseCustomRolePermissions(r.permissions).orders?.scope ?? "ALL",
          membershipCount: r._count.memberships,
        }))}
      />
    </div>
  );
}

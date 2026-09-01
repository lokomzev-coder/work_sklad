import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getOrgContext } from "@/lib/tenant";
import { can } from "@/lib/permissions";
import { SettingsSubnav } from "@/components/settings/settings-subnav";
import { GroupsManager } from "@/components/settings/groups-manager";

export default async function GroupsPage({
  params,
}: {
  params: Promise<{ org: string }>;
}) {
  const { org } = await params;
  const ctx = await getOrgContext(org);
  if (!can(ctx, "employees", "view")) notFound();

  const groups = await prisma.group.findMany({
    where: { orgId: ctx.orgId },
    orderBy: { name: "asc" },
    include: { _count: { select: { employees: true } } },
  });

  return (
    <div className="flex flex-col gap-6">
      <SettingsSubnav org={org} active="groups" />
      <div>
        <h1 className="text-2xl font-semibold">Отделы</h1>
        <p className="text-sm text-muted-foreground">
          Плоский список — без вложенности. Используются для видимости «свои + отдела» в
          пользовательских ролях (см. «Роли доступа»): сотрудник с такой видимостью видит записи
          всех, кто состоит в его отделе, не только свои.
        </p>
      </div>
      <GroupsManager
        orgSlug={org}
        groups={groups.map((g) => ({
          id: g.id,
          name: g.name,
          status: g.status,
          employeeCount: g._count.employees,
        }))}
      />
    </div>
  );
}

import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getOrgContext } from "@/lib/tenant";
import { can } from "@/lib/permissions";
import { SettingsSubnav } from "@/components/settings/settings-subnav";
import { CustomEntityTypesManager } from "@/components/settings/custom-entity-types-manager";

export default async function CustomEntitiesPage({
  params,
}: {
  params: Promise<{ org: string }>;
}) {
  const { org } = await params;
  const ctx = await getOrgContext(org);
  if (!can(ctx, "customFields", "view")) notFound();

  const types = await prisma.customEntityType.findMany({
    where: { orgId: ctx.orgId },
    orderBy: { name: "asc" },
    include: { values: { orderBy: { position: "asc" } } },
  });

  return (
    <div className="flex flex-col gap-6">
      <SettingsSubnav org={org} active="custom-entities" />
      <div>
        <h1 className="text-2xl font-semibold">Справочники</h1>
        <p className="text-sm text-muted-foreground">
          Пользовательские наборы значений (например, «Бренды», «Цвета») — можно использовать в
          поле типа «Справочник» на вкладке «Доп. поля», сразу в нескольких местах.
        </p>
      </div>
      <CustomEntityTypesManager orgSlug={org} types={types} />
    </div>
  );
}

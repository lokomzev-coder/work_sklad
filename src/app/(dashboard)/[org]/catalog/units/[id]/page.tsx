import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getOrgContext } from "@/lib/tenant";
import { updateUnit } from "@/actions/units";
import { UnitForm } from "@/components/catalog/unit-form";

export default async function EditUnitPage({
  params,
}: {
  params: Promise<{ org: string; id: string }>;
}) {
  const { org, id } = await params;
  const ctx = await getOrgContext(org);

  const unit = await prisma.unit.findFirst({
    where: { id, orgId: ctx.orgId },
  });

  if (!unit) {
    notFound();
  }

  const boundAction = updateUnit.bind(null, org, unit.id);

  return (
    <div className="flex max-w-lg flex-col gap-4">
      <h1 className="text-2xl font-semibold">{unit.name}</h1>
      <UnitForm
        orgSlug={org}
        action={boundAction}
        defaultValues={{ name: unit.name, shortName: unit.shortName }}
        submitLabel="Сохранить"
      />
    </div>
  );
}

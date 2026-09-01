import { prisma } from "@/lib/prisma";
import { getOrgContext } from "@/lib/tenant";
import { TechProcessForm } from "@/components/production/tech-process-form";

export default async function NewTechProcessPage({
  params,
}: {
  params: Promise<{ org: string }>;
}) {
  const { org } = await params;
  const ctx = await getOrgContext(org);

  const stages = await prisma.processingStage.findMany({
    where: { orgId: ctx.orgId, status: "ACTIVE" },
    orderBy: { name: "asc" },
  });

  return (
    <div className="flex max-w-2xl flex-col gap-4">
      <h1 className="text-2xl font-semibold">Новый техпроцесс</h1>
      <TechProcessForm
        orgSlug={org}
        techProcessId={null}
        stageOptions={stages.map((s) => ({ value: s.id, label: s.name }))}
      />
    </div>
  );
}

import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getOrgContext } from "@/lib/tenant";
import { TechProcessForm } from "@/components/production/tech-process-form";

export default async function EditTechProcessPage({
  params,
}: {
  params: Promise<{ org: string; id: string }>;
}) {
  const { org, id } = await params;
  const ctx = await getOrgContext(org);

  const [techProcess, stages] = await Promise.all([
    prisma.techProcess.findFirst({
      where: { id, orgId: ctx.orgId },
      include: { positions: { orderBy: { position: "asc" } } },
    }),
    prisma.processingStage.findMany({
      where: { orgId: ctx.orgId, status: "ACTIVE" },
      orderBy: { name: "asc" },
    }),
  ]);
  if (!techProcess) notFound();

  return (
    <div className="flex max-w-2xl flex-col gap-4">
      <h1 className="text-2xl font-semibold">{techProcess.name}</h1>
      <TechProcessForm
        orgSlug={org}
        techProcessId={techProcess.id}
        stageOptions={stages.map((s) => ({ value: s.id, label: s.name }))}
        defaultValues={{
          name: techProcess.name,
          processingStageIds: techProcess.positions.map((p) => p.processingStageId),
        }}
      />
    </div>
  );
}

import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getOrgContext } from "@/lib/tenant";
import { ProcessingStageForm } from "@/components/production/processing-stage-form";

export default async function EditProcessingStagePage({
  params,
}: {
  params: Promise<{ org: string; id: string }>;
}) {
  const { org, id } = await params;
  const ctx = await getOrgContext(org);

  const stage = await prisma.processingStage.findFirst({
    where: { id, orgId: ctx.orgId },
  });
  if (!stage) notFound();

  return (
    <div className="flex max-w-2xl flex-col gap-4">
      <h1 className="text-2xl font-semibold">{stage.name}</h1>
      <ProcessingStageForm
        orgSlug={org}
        processingStageId={stage.id}
        defaultValues={{
          name: stage.name,
          standardHourCost: stage.standardHourCost?.toString() ?? "",
        }}
      />
    </div>
  );
}

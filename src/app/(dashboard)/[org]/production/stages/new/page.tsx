import { ProcessingStageForm } from "@/components/production/processing-stage-form";

export default async function NewProcessingStagePage({
  params,
}: {
  params: Promise<{ org: string }>;
}) {
  const { org } = await params;

  return (
    <div className="flex max-w-2xl flex-col gap-4">
      <h1 className="text-2xl font-semibold">Новый этап производства</h1>
      <ProcessingStageForm orgSlug={org} processingStageId={null} />
    </div>
  );
}

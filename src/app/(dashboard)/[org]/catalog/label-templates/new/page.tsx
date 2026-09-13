import { notFound } from "next/navigation";
import { getOrgContext } from "@/lib/tenant";
import { can } from "@/lib/permissions";
import { LabelTemplateEditor } from "@/components/catalog/label-template-editor";

export default async function NewLabelTemplatePage({
  params,
}: {
  params: Promise<{ org: string }>;
}) {
  const { org } = await params;
  const ctx = await getOrgContext(org);
  if (!can(ctx, "labelTemplates", "create")) notFound();

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-2xl font-semibold">Конструктор этикеток</h1>
      <LabelTemplateEditor orgSlug={org} templateId={null} />
    </div>
  );
}

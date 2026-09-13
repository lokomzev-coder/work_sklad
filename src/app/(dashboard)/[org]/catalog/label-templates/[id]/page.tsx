import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getOrgContext } from "@/lib/tenant";
import { can } from "@/lib/permissions";
import { parseLabelElements } from "@/lib/label-template";
import { LabelTemplateEditor } from "@/components/catalog/label-template-editor";

export default async function EditLabelTemplatePage({
  params,
}: {
  params: Promise<{ org: string; id: string }>;
}) {
  const { org, id } = await params;
  const ctx = await getOrgContext(org);
  if (!can(ctx, "labelTemplates", "edit")) notFound();

  const template = await prisma.labelTemplate.findFirst({ where: { id, orgId: ctx.orgId } });
  if (!template) notFound();

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-2xl font-semibold">Конструктор этикеток — {template.name}</h1>
      <LabelTemplateEditor
        orgSlug={org}
        templateId={template.id}
        initialValues={{
          name: template.name,
          widthMm: template.widthMm,
          heightMm: template.heightMm,
          elements: parseLabelElements(template.elements),
        }}
      />
    </div>
  );
}

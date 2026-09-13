"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { getOrgContext } from "@/lib/tenant";
import { assertPermission } from "@/lib/permissions";
import { labelTemplateInputSchema, type LabelTemplateInput } from "@/lib/label-template";

export interface LabelTemplateActionResult {
  error?: string;
  id?: string;
}

export async function upsertLabelTemplate(
  orgSlug: string,
  templateId: string | null,
  input: LabelTemplateInput,
): Promise<LabelTemplateActionResult> {
  const ctx = await getOrgContext(orgSlug);
  assertPermission(ctx, "labelTemplates", templateId ? "edit" : "create");

  const parsed = labelTemplateInputSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Неверные данные" };
  }

  const existingByName = await prisma.labelTemplate.findFirst({
    where: { orgId: ctx.orgId, name: parsed.data.name, id: templateId ? { not: templateId } : undefined },
  });
  if (existingByName) {
    return { error: "Шаблон с таким названием уже существует" };
  }

  const data = {
    name: parsed.data.name,
    widthMm: parsed.data.widthMm,
    heightMm: parsed.data.heightMm,
    elements: parsed.data.elements,
  };

  if (templateId) {
    const existing = await prisma.labelTemplate.findFirst({ where: { id: templateId, orgId: ctx.orgId } });
    if (!existing) return { error: "Шаблон не найден" };
    await prisma.labelTemplate.update({ where: { id: templateId }, data });
    revalidatePath(`/${orgSlug}/catalog/label-templates/${templateId}`);
    revalidatePath(`/${orgSlug}/catalog`);
    return { id: templateId };
  }

  const created = await prisma.labelTemplate.create({ data: { ...data, orgId: ctx.orgId } });
  revalidatePath(`/${orgSlug}/catalog`);
  return { id: created.id };
}

export async function deleteLabelTemplate(orgSlug: string, templateId: string): Promise<LabelTemplateActionResult> {
  const ctx = await getOrgContext(orgSlug);
  assertPermission(ctx, "labelTemplates", "delete");

  const existing = await prisma.labelTemplate.findFirst({ where: { id: templateId, orgId: ctx.orgId } });
  if (!existing) return { error: "Шаблон не найден" };

  await prisma.labelTemplate.delete({ where: { id: templateId } });
  revalidatePath(`/${orgSlug}/catalog`);
  return {};
}

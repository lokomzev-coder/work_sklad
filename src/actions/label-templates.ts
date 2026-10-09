"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { getOrgContext } from "@/lib/tenant";
import { assertPermission } from "@/lib/permissions";
import { assertFeatureEnabled, KNOWN_FEATURE_KEYS } from "@/lib/subscription";
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
  if (!templateId) {
    assertFeatureEnabled(ctx, KNOWN_FEATURE_KEYS.labelTemplates);
  }

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

/**
 * Block W (explicit request, 2026-09-22) — one-click "основной" template
 * (артикул + штрихкод) instead of building the same obvious layout by hand
 * every time. Just a normal LabelTemplate row once created — sizes and
 * elements are freely editable afterward in the constructor like any other
 * template, nothing about it is special-cased or locked.
 */
export async function createDefaultLabelTemplate(orgSlug: string): Promise<LabelTemplateActionResult> {
  const widthMm = 58;
  const heightMm = 40;
  return upsertLabelTemplate(orgSlug, null, {
    name: "Основной (артикул + штрихкод)",
    widthMm,
    heightMm,
    elements: [
      { id: "sku", type: "field", field: "sku", x: 2, y: 2, width: widthMm - 4, height: 8, fontSize: 10 },
      { id: "barcode", type: "barcode", x: 2, y: 12, width: widthMm - 4, height: 20, fontSize: 10 },
    ],
  });
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

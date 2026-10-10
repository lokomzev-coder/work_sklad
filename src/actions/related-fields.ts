"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getOrgContext } from "@/lib/tenant";
import { assertPermission } from "@/lib/permissions";
import { assertFeatureEnabled, KNOWN_FEATURE_KEYS } from "@/lib/subscription";
import { CLIENT_BUILTIN_FIELDS } from "@/lib/related-fields";
import type { RelatedFieldDocumentType } from "@/generated/prisma/enums";

export interface ActionResult {
  error?: string;
}

const createSchema = z.object({
  sourceKind: z.enum(["BUILTIN", "CUSTOM"]),
  fieldKey: z.string().optional(),
  customFieldDefinitionId: z.string().optional(),
});

export async function createRelatedFieldConfig(
  orgSlug: string,
  documentType: RelatedFieldDocumentType,
  _prevState: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const ctx = await getOrgContext(orgSlug);
  assertPermission(ctx, "customFields", "create");
  assertFeatureEnabled(ctx, KNOWN_FEATURE_KEYS.customFields);

  const parsed = createSchema.safeParse({
    sourceKind: formData.get("sourceKind"),
    fieldKey: formData.get("fieldKey") || undefined,
    customFieldDefinitionId: formData.get("customFieldDefinitionId") || undefined,
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Неверные данные" };
  }

  let fieldKey: string | null = null;
  let customFieldDefinitionId: string | null = null;

  if (parsed.data.sourceKind === "BUILTIN") {
    if (!CLIENT_BUILTIN_FIELDS.some((f) => f.key === parsed.data.fieldKey)) {
      return { error: "Выберите поле" };
    }
    fieldKey = parsed.data.fieldKey!;
    const exists = await prisma.relatedFieldConfig.findFirst({
      where: { orgId: ctx.orgId, documentType, sourceKind: "BUILTIN", fieldKey },
    });
    if (exists) return { error: "Это поле уже добавлено" };
  } else {
    if (!parsed.data.customFieldDefinitionId) {
      return { error: "Выберите поле" };
    }
    const def = await prisma.customFieldDefinition.findFirst({
      where: { id: parsed.data.customFieldDefinitionId, orgId: ctx.orgId, entityType: "CLIENT" },
    });
    if (!def) return { error: "Поле не найдено" };
    customFieldDefinitionId = def.id;
    const exists = await prisma.relatedFieldConfig.findFirst({
      where: { orgId: ctx.orgId, documentType, sourceKind: "CUSTOM", customFieldDefinitionId },
    });
    if (exists) return { error: "Это поле уже добавлено" };
  }

  const count = await prisma.relatedFieldConfig.count({ where: { orgId: ctx.orgId, documentType } });
  await prisma.relatedFieldConfig.create({
    data: {
      orgId: ctx.orgId,
      documentType,
      sourceKind: parsed.data.sourceKind,
      fieldKey,
      customFieldDefinitionId,
      position: count,
    },
  });

  revalidatePath(`/${orgSlug}/settings/related-fields`);
  return {};
}

export async function deleteRelatedFieldConfig(orgSlug: string, id: string) {
  const ctx = await getOrgContext(orgSlug);
  assertPermission(ctx, "customFields", "delete");

  await prisma.relatedFieldConfig.delete({ where: { id, orgId: ctx.orgId } });

  revalidatePath(`/${orgSlug}/settings/related-fields`);
}

"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getOrgContext } from "@/lib/tenant";
import { assertPermission } from "@/lib/permissions";
import type { CustomFieldEntityType } from "@/generated/prisma/enums";

export interface ActionResult {
  error?: string;
}

const createSchema = z.object({
  name: z.string().trim().min(1, "Введите название").max(60),
  type: z.enum(["TEXT", "NUMBER", "DATE", "BOOLEAN", "SELECT", "CUSTOM_ENTITY"]),
  options: z.string().optional(),
  customEntityTypeId: z.string().optional(),
});

export async function createCustomFieldDefinition(
  orgSlug: string,
  entityType: CustomFieldEntityType,
  _prevState: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const ctx = await getOrgContext(orgSlug);
  assertPermission(ctx, "customFields", "create");

  const parsed = createSchema.safeParse({
    name: formData.get("name"),
    type: formData.get("type"),
    options: formData.get("options"),
    customEntityTypeId: formData.get("customEntityTypeId") || undefined,
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Неверные данные" };
  }

  const options =
    parsed.data.type === "SELECT"
      ? (parsed.data.options ?? "")
          .split(",")
          .map((o) => o.trim())
          .filter(Boolean)
      : [];

  let customEntityTypeId: string | null = null;
  if (parsed.data.type === "CUSTOM_ENTITY") {
    if (!parsed.data.customEntityTypeId) {
      return { error: "Выберите справочник" };
    }
    const entityDict = await prisma.customEntityType.findFirst({
      where: { id: parsed.data.customEntityTypeId, orgId: ctx.orgId },
    });
    if (!entityDict) return { error: "Справочник не найден" };
    customEntityTypeId = entityDict.id;
  }

  const count = await prisma.customFieldDefinition.count({ where: { orgId: ctx.orgId, entityType } });

  try {
    await prisma.customFieldDefinition.create({
      data: {
        orgId: ctx.orgId,
        entityType,
        name: parsed.data.name,
        type: parsed.data.type,
        options,
        customEntityTypeId,
        position: count,
      },
    });
  } catch {
    return { error: "Поле с таким названием уже есть" };
  }

  revalidatePath(`/${orgSlug}/settings/custom-fields`);
  return {};
}

export async function deleteCustomFieldDefinition(orgSlug: string, definitionId: string) {
  const ctx = await getOrgContext(orgSlug);
  assertPermission(ctx, "customFields", "delete");

  await prisma.customFieldDefinition.delete({ where: { id: definitionId, orgId: ctx.orgId } });

  revalidatePath(`/${orgSlug}/settings/custom-fields`);
}

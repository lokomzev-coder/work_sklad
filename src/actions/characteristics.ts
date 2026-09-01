"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getOrgContext } from "@/lib/tenant";
import { assertPermission } from "@/lib/permissions";
import { characteristicSchema } from "@/lib/validation/characteristic";

export interface ActionResult {
  error?: string;
}

export async function createCharacteristic(
  orgSlug: string,
  _prevState: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const ctx = await getOrgContext(orgSlug);
  assertPermission(ctx, "catalog", "create");

  const parsed = characteristicSchema.safeParse({ name: formData.get("name") });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Неверные данные" };
  }

  try {
    await prisma.characteristic.create({ data: { ...parsed.data, orgId: ctx.orgId } });
  } catch {
    return { error: "Такая характеристика уже существует" };
  }

  revalidatePath(`/${orgSlug}/catalog/characteristics`);
  redirect(`/${orgSlug}/catalog/characteristics`);
}

export async function deleteCharacteristic(orgSlug: string, characteristicId: string) {
  const ctx = await getOrgContext(orgSlug);
  assertPermission(ctx, "catalog", "delete");

  const usageCount = await prisma.catalogItemVariantValue.count({
    where: { characteristicId },
  });
  if (usageCount > 0) {
    return { error: `Нельзя удалить: используется в ${usageCount} модификаци(ях)` };
  }

  await prisma.characteristic.delete({ where: { id: characteristicId, orgId: ctx.orgId } });
  revalidatePath(`/${orgSlug}/catalog/characteristics`);
  return {};
}

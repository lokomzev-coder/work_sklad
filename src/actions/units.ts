"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getOrgContext } from "@/lib/tenant";
import { assertPermission } from "@/lib/permissions";
import { unitSchema } from "@/lib/validation/unit";

export interface ActionResult {
  error?: string;
}

function parseUnitForm(formData: FormData) {
  return unitSchema.safeParse({
    name: formData.get("name"),
    shortName: formData.get("shortName"),
  });
}

export async function createUnit(
  orgSlug: string,
  _prevState: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const ctx = await getOrgContext(orgSlug);
  assertPermission(ctx.role, "catalog", "edit");

  const parsed = parseUnitForm(formData);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Неверные данные" };
  }

  try {
    await prisma.unit.create({ data: { ...parsed.data, orgId: ctx.orgId } });
  } catch {
    return { error: "Такая единица измерения уже существует" };
  }

  revalidatePath(`/${orgSlug}/catalog/units`);
  redirect(`/${orgSlug}/catalog/units`);
}

export async function updateUnit(
  orgSlug: string,
  unitId: string,
  _prevState: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const ctx = await getOrgContext(orgSlug);
  assertPermission(ctx.role, "catalog", "edit");

  const parsed = parseUnitForm(formData);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Неверные данные" };
  }

  try {
    await prisma.unit.update({
      where: { id: unitId, orgId: ctx.orgId },
      data: parsed.data,
    });
  } catch {
    return { error: "Такая единица измерения уже существует" };
  }

  revalidatePath(`/${orgSlug}/catalog/units`);
  redirect(`/${orgSlug}/catalog/units`);
}

export async function deleteUnit(orgSlug: string, unitId: string) {
  const ctx = await getOrgContext(orgSlug);
  assertPermission(ctx.role, "catalog", "edit");

  const usageCount = await prisma.catalogItem.count({
    where: { unitId, orgId: ctx.orgId },
  });
  if (usageCount > 0) {
    return {
      error: `Нельзя удалить: единица используется в ${usageCount} позици(ях) каталога`,
    };
  }

  await prisma.unit.delete({ where: { id: unitId, orgId: ctx.orgId } });
  revalidatePath(`/${orgSlug}/catalog/units`);
  return {};
}

"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getOrgContext } from "@/lib/tenant";
import { assertPermission } from "@/lib/permissions";
import { priceTypeSchema } from "@/lib/validation/price-type";

export interface ActionResult {
  error?: string;
}

function parseForm(formData: FormData) {
  return priceTypeSchema.safeParse({
    name: formData.get("name"),
    isDefault: formData.get("isDefault"),
  });
}

export async function createPriceType(
  orgSlug: string,
  _prevState: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const ctx = await getOrgContext(orgSlug);
  assertPermission(ctx, "priceTypes", "create");

  const parsed = parseForm(formData);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Неверные данные" };
  }

  try {
    await prisma.priceType.create({ data: { ...parsed.data, orgId: ctx.orgId } });
  } catch {
    return { error: "Такой тип цены уже существует" };
  }

  revalidatePath(`/${orgSlug}/settings/price-types`);
  redirect(`/${orgSlug}/settings/price-types`);
}

export async function deletePriceType(orgSlug: string, priceTypeId: string): Promise<ActionResult> {
  const ctx = await getOrgContext(orgSlug);
  assertPermission(ctx, "priceTypes", "delete");

  await prisma.priceType.delete({ where: { id: priceTypeId, orgId: ctx.orgId } });
  revalidatePath(`/${orgSlug}/settings/price-types`);
  return {};
}

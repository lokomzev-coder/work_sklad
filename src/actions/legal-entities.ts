"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getOrgContext } from "@/lib/tenant";
import { assertPermission } from "@/lib/permissions";
import { legalEntitySchema } from "@/lib/validation/legal-entity";
import { archiveOrDelete } from "@/lib/archive";

export interface ActionResult {
  error?: string;
}

function parseForm(formData: FormData) {
  return legalEntitySchema.safeParse({
    name: formData.get("name"),
    inn: formData.get("inn"),
    kpp: formData.get("kpp"),
    ogrn: formData.get("ogrn"),
    address: formData.get("address"),
    bankName: formData.get("bankName"),
    bankBik: formData.get("bankBik"),
    bankAccount: formData.get("bankAccount"),
    isDefault: formData.get("isDefault"),
  });
}

/** Only one LegalEntity per org can be `isDefault` — unsetting the others is
 * simpler than a partial unique index for a single boolean flag. */
async function clearOtherDefaults(orgId: string, exceptId?: string) {
  await prisma.legalEntity.updateMany({
    where: { orgId, isDefault: true, ...(exceptId ? { id: { not: exceptId } } : {}) },
    data: { isDefault: false },
  });
}

export async function createLegalEntity(
  orgSlug: string,
  _prevState: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const ctx = await getOrgContext(orgSlug);
  assertPermission(ctx.role, "settings", "edit");

  const parsed = parseForm(formData);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Неверные данные" };
  }

  const created = await prisma.legalEntity.create({
    data: { ...parsed.data, orgId: ctx.orgId },
  });
  if (parsed.data.isDefault) {
    await clearOtherDefaults(ctx.orgId, created.id);
  }

  revalidatePath(`/${orgSlug}/settings/legal-entities`);
  redirect(`/${orgSlug}/settings/legal-entities`);
}

export async function updateLegalEntity(
  orgSlug: string,
  legalEntityId: string,
  _prevState: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const ctx = await getOrgContext(orgSlug);
  assertPermission(ctx.role, "settings", "edit");

  const parsed = parseForm(formData);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Неверные данные" };
  }

  await prisma.legalEntity.update({
    where: { id: legalEntityId, orgId: ctx.orgId },
    data: parsed.data,
  });
  if (parsed.data.isDefault) {
    await clearOtherDefaults(ctx.orgId, legalEntityId);
  }

  revalidatePath(`/${orgSlug}/settings/legal-entities`);
  redirect(`/${orgSlug}/settings/legal-entities`);
}

export async function archiveLegalEntity(orgSlug: string, legalEntityId: string) {
  const ctx = await getOrgContext(orgSlug);
  assertPermission(ctx.role, "settings", "edit");

  await prisma.legalEntity.update({
    where: { id: legalEntityId, orgId: ctx.orgId },
    data: { status: "ARCHIVED", archivedAt: new Date() },
  });

  revalidatePath(`/${orgSlug}/settings/legal-entities`);
}

export async function restoreLegalEntity(orgSlug: string, legalEntityId: string) {
  const ctx = await getOrgContext(orgSlug);
  assertPermission(ctx.role, "settings", "edit");

  await prisma.legalEntity.update({
    where: { id: legalEntityId, orgId: ctx.orgId },
    data: { status: "ACTIVE", archivedAt: null },
  });

  revalidatePath(`/${orgSlug}/settings/legal-entities`);
}

export async function deleteLegalEntity(orgSlug: string, legalEntityId: string) {
  const ctx = await getOrgContext(orgSlug);
  assertPermission(ctx.role, "settings", "edit");

  const result = await archiveOrDelete("legalEntity", legalEntityId, ctx.orgId);

  revalidatePath(`/${orgSlug}/settings/legal-entities`);
  return result;
}

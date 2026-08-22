"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getOrgContext } from "@/lib/tenant";
import { assertPermission } from "@/lib/permissions";
import { storeSchema } from "@/lib/validation/store";
import { archiveOrDelete } from "@/lib/archive";

export interface ActionResult {
  error?: string;
}

function parseStoreForm(formData: FormData) {
  return storeSchema.safeParse({
    name: formData.get("name"),
    address: formData.get("address"),
  });
}

export async function createStore(
  orgSlug: string,
  _prevState: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const ctx = await getOrgContext(orgSlug);
  assertPermission(ctx.role, "warehouse", "edit");

  const parsed = parseStoreForm(formData);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Неверные данные" };
  }

  await prisma.store.create({ data: { ...parsed.data, orgId: ctx.orgId } });

  revalidatePath(`/${orgSlug}/warehouse/stores`);
  redirect(`/${orgSlug}/warehouse/stores`);
}

export async function updateStore(
  orgSlug: string,
  storeId: string,
  _prevState: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const ctx = await getOrgContext(orgSlug);
  assertPermission(ctx.role, "warehouse", "edit");

  const parsed = parseStoreForm(formData);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Неверные данные" };
  }

  await prisma.store.update({
    where: { id: storeId, orgId: ctx.orgId },
    data: parsed.data,
  });

  revalidatePath(`/${orgSlug}/warehouse/stores`);
  redirect(`/${orgSlug}/warehouse/stores`);
}

export async function archiveStore(orgSlug: string, storeId: string) {
  const ctx = await getOrgContext(orgSlug);
  assertPermission(ctx.role, "warehouse", "edit");

  await prisma.store.update({
    where: { id: storeId, orgId: ctx.orgId },
    data: { status: "ARCHIVED", archivedAt: new Date() },
  });

  revalidatePath(`/${orgSlug}/warehouse/stores`);
}

export async function restoreStore(orgSlug: string, storeId: string) {
  const ctx = await getOrgContext(orgSlug);
  assertPermission(ctx.role, "warehouse", "edit");

  await prisma.store.update({
    where: { id: storeId, orgId: ctx.orgId },
    data: { status: "ACTIVE", archivedAt: null },
  });

  revalidatePath(`/${orgSlug}/warehouse/stores`);
}

export async function deleteStore(orgSlug: string, storeId: string) {
  const ctx = await getOrgContext(orgSlug);
  assertPermission(ctx.role, "warehouse", "edit");

  const result = await archiveOrDelete("store", storeId, ctx.orgId);

  revalidatePath(`/${orgSlug}/warehouse/stores`);
  return result;
}

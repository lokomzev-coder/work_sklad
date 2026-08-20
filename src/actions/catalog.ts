"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getOrgContext } from "@/lib/tenant";
import { assertPermission } from "@/lib/permissions";
import { catalogItemSchema } from "@/lib/validation/catalog";
import { archiveOrDelete } from "@/lib/archive";

export interface ActionResult {
  error?: string;
}

function parseCatalogItemForm(formData: FormData) {
  return catalogItemSchema.safeParse({
    name: formData.get("name"),
    type: formData.get("type"),
    sku: formData.get("sku"),
    unitPrice: formData.get("unitPrice"),
    currency: formData.get("currency") || "RUB",
  });
}

export async function createCatalogItem(
  orgSlug: string,
  _prevState: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const ctx = await getOrgContext(orgSlug);
  assertPermission(ctx.role, "catalog", "edit");

  const parsed = parseCatalogItemForm(formData);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Неверные данные" };
  }

  await prisma.catalogItem.create({
    data: { ...parsed.data, orgId: ctx.orgId },
  });

  revalidatePath(`/${orgSlug}/catalog`);
  redirect(`/${orgSlug}/catalog`);
}

export async function updateCatalogItem(
  orgSlug: string,
  itemId: string,
  _prevState: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const ctx = await getOrgContext(orgSlug);
  assertPermission(ctx.role, "catalog", "edit");

  const parsed = parseCatalogItemForm(formData);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Неверные данные" };
  }

  await prisma.catalogItem.update({
    where: { id: itemId, orgId: ctx.orgId },
    data: parsed.data,
  });

  revalidatePath(`/${orgSlug}/catalog`);
  redirect(`/${orgSlug}/catalog`);
}

export async function archiveCatalogItem(orgSlug: string, itemId: string) {
  const ctx = await getOrgContext(orgSlug);
  assertPermission(ctx.role, "catalog", "edit");

  await prisma.catalogItem.update({
    where: { id: itemId, orgId: ctx.orgId },
    data: { status: "ARCHIVED", archivedAt: new Date() },
  });

  revalidatePath(`/${orgSlug}/catalog`);
}

export async function restoreCatalogItem(orgSlug: string, itemId: string) {
  const ctx = await getOrgContext(orgSlug);
  assertPermission(ctx.role, "catalog", "edit");

  await prisma.catalogItem.update({
    where: { id: itemId, orgId: ctx.orgId },
    data: { status: "ACTIVE", archivedAt: null },
  });

  revalidatePath(`/${orgSlug}/catalog`);
}

export async function deleteCatalogItem(orgSlug: string, itemId: string) {
  const ctx = await getOrgContext(orgSlug);
  assertPermission(ctx.role, "catalog", "edit");

  const result = await archiveOrDelete("catalogItem", itemId, ctx.orgId);

  revalidatePath(`/${orgSlug}/catalog`);
  return result;
}

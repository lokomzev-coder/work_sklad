"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getOrgContext } from "@/lib/tenant";
import { assertPermission } from "@/lib/permissions";
import { catalogItemSchema } from "@/lib/validation/catalog";
import { archiveOrDelete } from "@/lib/archive";
import { saveCustomFieldValues } from "@/lib/custom-fields";
import { generateEan13 } from "@/lib/barcode-generate";

export interface ActionResult {
  error?: string;
}

function parseCatalogItemForm(formData: FormData) {
  const unitId = formData.get("unitId");
  return catalogItemSchema.safeParse({
    name: formData.get("name"),
    type: formData.get("type"),
    sku: formData.get("sku"),
    barcode: formData.get("barcode"),
    unitPrice: formData.get("unitPrice"),
    currency: formData.get("currency") || "RUB",
    unitId: unitId === "__none__" ? "" : unitId,
    groupId: formData.get("groupId"),
    taxRate: formData.get("taxRate") || "NONE",
    minStock: formData.get("minStock"),
  });
}

// unitId/groupId come from client-controlled <select> values — confirm they
// actually belong to this org before writing, otherwise a crafted form
// submission could link a catalog item to another org's unit/group.
async function assertRefsBelongToOrg(
  orgId: string,
  unitId: string | undefined,
  groupId: string | undefined,
) {
  if (unitId) {
    const unit = await prisma.unit.findFirst({ where: { id: unitId, orgId } });
    if (!unit) throw new Error("Единица измерения не найдена");
  }
  if (groupId) {
    const group = await prisma.catalogGroup.findFirst({
      where: { id: groupId, orgId },
    });
    if (!group) throw new Error("Группа не найдена");
  }
}

export async function createCatalogItem(
  orgSlug: string,
  _prevState: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const ctx = await getOrgContext(orgSlug);
  assertPermission(ctx, "catalog", "create");

  const parsed = parseCatalogItemForm(formData);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Неверные данные" };
  }
  await assertRefsBelongToOrg(ctx.orgId, parsed.data.unitId, parsed.data.groupId);

  const item = await prisma.catalogItem.create({
    data: { ...parsed.data, orgId: ctx.orgId },
  });
  await saveCustomFieldValues(ctx.orgId, "CATALOG_ITEM", item.id, formData);

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
  assertPermission(ctx, "catalog", "edit");

  const parsed = parseCatalogItemForm(formData);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Неверные данные" };
  }
  await assertRefsBelongToOrg(ctx.orgId, parsed.data.unitId, parsed.data.groupId);

  await prisma.catalogItem.update({
    where: { id: itemId, orgId: ctx.orgId },
    data: {
      ...parsed.data,
      unitId: parsed.data.unitId ?? null,
      groupId: parsed.data.groupId ?? null,
      minStock: parsed.data.minStock ?? null,
    },
  });
  await saveCustomFieldValues(ctx.orgId, "CATALOG_ITEM", itemId, formData);

  revalidatePath(`/${orgSlug}/catalog`);
  redirect(`/${orgSlug}/catalog`);
}

export async function archiveCatalogItem(orgSlug: string, itemId: string) {
  const ctx = await getOrgContext(orgSlug);
  assertPermission(ctx, "catalog", "edit");

  await prisma.catalogItem.update({
    where: { id: itemId, orgId: ctx.orgId },
    data: { status: "ARCHIVED", archivedAt: new Date() },
  });

  revalidatePath(`/${orgSlug}/catalog`);
}

export async function restoreCatalogItem(orgSlug: string, itemId: string) {
  const ctx = await getOrgContext(orgSlug);
  assertPermission(ctx, "catalog", "edit");

  await prisma.catalogItem.update({
    where: { id: itemId, orgId: ctx.orgId },
    data: { status: "ACTIVE", archivedAt: null },
  });

  revalidatePath(`/${orgSlug}/catalog`);
}

export async function deleteCatalogItem(orgSlug: string, itemId: string) {
  const ctx = await getOrgContext(orgSlug);
  assertPermission(ctx, "catalog", "delete");

  const result = await archiveOrDelete("catalogItem", itemId, ctx.orgId);

  revalidatePath(`/${orgSlug}/catalog`);
  return result;
}

/**
 * Block R — fills the barcode field with a fresh, valid EAN-13 (real check
 * digit, so real retail scanners accept it) instead of the caller inventing
 * one by hand. Purely generates a value — doesn't write anything itself,
 * the caller still has to submit the form/row it's filling for the value to
 * actually persist. Gated the same as any other catalog edit, not "view",
 * since it's only ever wired to an edit-time button.
 */
export async function generateBarcode(orgSlug: string): Promise<{ barcode: string } | ActionResult> {
  const ctx = await getOrgContext(orgSlug);
  assertPermission(ctx, "catalog", "edit");

  const barcode = await generateEan13(ctx.orgId);
  return { barcode };
}

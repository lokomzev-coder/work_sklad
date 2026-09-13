"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getOrgContext } from "@/lib/tenant";
import { assertPermission } from "@/lib/permissions";

export interface ActionResult {
  error?: string;
}

const packagingSchema = z.object({
  packagingTypeId: z.string().min(1, "Выберите вид упаковки"),
  quantity: z.coerce.number().positive("Количество должно быть больше 0"),
  unitId: z
    .string()
    .trim()
    .optional()
    .transform((v) => v || undefined),
  barcode: z
    .string()
    .trim()
    .max(64)
    .optional()
    .transform((v) => v || undefined),
});

export interface CatalogItemPackagingInput {
  packagingTypeId: string;
  quantity: number;
  unitId?: string;
  barcode?: string;
}

/**
 * Block R — quick-create for the org-wide PackagingType reference list
 * (name only), same shape as `quickCreateProject` (src/actions/
 * projects.ts) — the new row is returned so PackagingTypeCombobox can add
 * it to its local option list and select it immediately, no separate
 * management page in this block (see ROADMAP.md scope note).
 */
export interface QuickCreatePackagingTypeResult {
  packagingType?: { id: string; name: string };
  error?: string;
}

export async function quickCreatePackagingType(
  orgSlug: string,
  name: string,
): Promise<QuickCreatePackagingTypeResult> {
  const ctx = await getOrgContext(orgSlug);
  assertPermission(ctx, "catalog", "create");

  const trimmed = name.trim();
  if (!trimmed) {
    return { error: "Введите название" };
  }

  const existing = await prisma.packagingType.findFirst({ where: { orgId: ctx.orgId, name: trimmed } });
  if (existing) {
    return { packagingType: { id: existing.id, name: existing.name } };
  }

  const created = await prisma.packagingType.create({ data: { orgId: ctx.orgId, name: trimmed } });
  return { packagingType: { id: created.id, name: created.name } };
}

export async function createPackaging(
  orgSlug: string,
  catalogItemId: string,
  input: CatalogItemPackagingInput,
): Promise<ActionResult> {
  const ctx = await getOrgContext(orgSlug);
  assertPermission(ctx, "catalog", "create");

  const parsed = packagingSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Неверные данные" };
  }

  const item = await prisma.catalogItem.findFirst({ where: { id: catalogItemId, orgId: ctx.orgId } });
  if (!item) {
    return { error: "Товар не найден" };
  }
  const packagingType = await prisma.packagingType.findFirst({
    where: { id: parsed.data.packagingTypeId, orgId: ctx.orgId },
  });
  if (!packagingType) {
    return { error: "Вид упаковки не найден" };
  }
  if (parsed.data.unitId) {
    const unit = await prisma.unit.findFirst({ where: { id: parsed.data.unitId, orgId: ctx.orgId } });
    if (!unit) {
      return { error: "Единица измерения не найдена" };
    }
  }

  await prisma.catalogItemPackaging.create({
    data: {
      catalogItemId,
      packagingTypeId: parsed.data.packagingTypeId,
      quantity: parsed.data.quantity,
      unitId: parsed.data.unitId ?? null,
      barcode: parsed.data.barcode ?? null,
    },
  });

  revalidatePath(`/${orgSlug}/catalog/${catalogItemId}`);
  return {};
}

// Unlike CatalogItemVariant, nothing else in the schema references
// CatalogItemPackaging (it doesn't participate in orders/stock — purely a
// reference/print attribute, see ROADMAP.md) — so there's no usage-count
// guard to check before deleting, unlike deleteCatalogVariant.
export async function deletePackaging(
  orgSlug: string,
  catalogItemId: string,
  packagingId: string,
): Promise<ActionResult> {
  const ctx = await getOrgContext(orgSlug);
  assertPermission(ctx, "catalog", "delete");

  const item = await prisma.catalogItem.findFirst({ where: { id: catalogItemId, orgId: ctx.orgId } });
  if (!item) {
    return { error: "Товар не найден" };
  }

  await prisma.catalogItemPackaging.delete({ where: { id: packagingId, catalogItemId } });
  revalidatePath(`/${orgSlug}/catalog/${catalogItemId}`);
  return {};
}

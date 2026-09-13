"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getOrgContext } from "@/lib/tenant";
import { assertPermission } from "@/lib/permissions";

const variantValueSchema = z.object({
  characteristicId: z.string().min(1),
  value: z.string().trim().min(1),
});

const variantSchema = z.object({
  sku: z
    .string()
    .trim()
    .max(100)
    .optional()
    .transform((v) => v || undefined),
  barcode: z
    .string()
    .trim()
    .max(64)
    .optional()
    .transform((v) => v || undefined),
  priceOverride: z
    .string()
    .trim()
    .optional()
    .transform((v) => (v ? Number(v) : undefined)),
  values: z.array(variantValueSchema),
});

export interface CatalogVariantInput {
  sku?: string;
  barcode?: string;
  priceOverride?: number;
  values: { characteristicId: string; value: string }[];
}

export interface CatalogVariantResult {
  error?: string;
}

async function assertValuesBelongToOrg(orgId: string, values: { characteristicId: string }[]) {
  const characteristicIds = [...new Set(values.map((v) => v.characteristicId))];
  if (characteristicIds.length === 0) return;
  const count = await prisma.characteristic.count({
    where: { id: { in: characteristicIds }, orgId },
  });
  if (count !== characteristicIds.length) {
    throw new Error("Характеристика не найдена");
  }
}

// Core creation logic without redirect/revalidate side effects — reused by
// the plain Server Action below (manual "add variant" form) AND by Block
// J's import batch processor (src/actions/catalog-import.ts), which drives
// its own revalidation/progress reporting instead.
export async function createCatalogVariantRecord(
  orgId: string,
  catalogItemId: string,
  input: CatalogVariantInput,
): Promise<{ id: string } | { error: string }> {
  const parsed = variantSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Неверные данные" };
  }

  const catalogItem = await prisma.catalogItem.findFirst({
    where: { id: catalogItemId, orgId },
  });
  if (!catalogItem || catalogItem.type !== "PRODUCT") {
    return { error: "Модификации доступны только для товаров" };
  }

  await assertValuesBelongToOrg(orgId, parsed.data.values);

  const created = await prisma.catalogItemVariant.create({
    data: {
      catalogItemId,
      sku: parsed.data.sku,
      barcode: parsed.data.barcode,
      priceOverride: parsed.data.priceOverride,
      values: { create: parsed.data.values },
    },
  });

  return { id: created.id };
}

export async function createCatalogVariant(
  orgSlug: string,
  catalogItemId: string,
  input: CatalogVariantInput,
): Promise<CatalogVariantResult> {
  const ctx = await getOrgContext(orgSlug);
  assertPermission(ctx, "catalog", "create");

  const result = await createCatalogVariantRecord(ctx.orgId, catalogItemId, input);
  if ("error" in result) return result;

  revalidatePath(`/${orgSlug}/catalog/${catalogItemId}`);
  return {};
}

export async function deleteCatalogVariant(
  orgSlug: string,
  catalogItemId: string,
  variantId: string,
): Promise<CatalogVariantResult> {
  const ctx = await getOrgContext(orgSlug);
  assertPermission(ctx, "catalog", "delete");

  const catalogItem = await prisma.catalogItem.findFirst({
    where: { id: catalogItemId, orgId: ctx.orgId },
  });
  if (!catalogItem) {
    return { error: "Товар не найден" };
  }

  // Block M6: onDelete: Restrict on every one of these FKs already protects
  // the delete at the DB level — this check is purely a friendlier error
  // message than a raw Prisma foreign-key-violation crash. Counts every
  // relation that can reference a variant (previously only orderLineItem,
  // which already missed invoiceOutLineItem — folded in here too).
  const [orderCount, invoiceOutCount, purchaseOrderCount, invoiceInCount, movementLineCount, batchCount] =
    await Promise.all([
      prisma.orderLineItem.count({ where: { variantId } }),
      prisma.invoiceOutLineItem.count({ where: { variantId } }),
      prisma.purchaseOrderLineItem.count({ where: { variantId } }),
      prisma.invoiceInLineItem.count({ where: { variantId } }),
      prisma.stockMovementLine.count({ where: { variantId } }),
      prisma.stockBatch.count({ where: { variantId } }),
    ]);
  const usageCount =
    orderCount + invoiceOutCount + purchaseOrderCount + invoiceInCount + movementLineCount + batchCount;
  if (usageCount > 0) {
    return { error: `Нельзя удалить: используется в ${usageCount} позици(ях)` };
  }

  await prisma.catalogItemVariant.delete({ where: { id: variantId, catalogItemId } });
  revalidatePath(`/${orgSlug}/catalog/${catalogItemId}`);
  return {};
}

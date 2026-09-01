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

export async function createCatalogVariant(
  orgSlug: string,
  catalogItemId: string,
  input: CatalogVariantInput,
): Promise<CatalogVariantResult> {
  const ctx = await getOrgContext(orgSlug);
  assertPermission(ctx, "catalog", "create");

  const parsed = variantSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Неверные данные" };
  }

  const catalogItem = await prisma.catalogItem.findFirst({
    where: { id: catalogItemId, orgId: ctx.orgId },
  });
  if (!catalogItem || catalogItem.type !== "PRODUCT") {
    return { error: "Модификации доступны только для товаров" };
  }

  await assertValuesBelongToOrg(ctx.orgId, parsed.data.values);

  await prisma.catalogItemVariant.create({
    data: {
      catalogItemId,
      sku: parsed.data.sku,
      barcode: parsed.data.barcode,
      priceOverride: parsed.data.priceOverride,
      values: { create: parsed.data.values },
    },
  });

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

  const usageCount = await prisma.orderLineItem.count({ where: { variantId } });
  if (usageCount > 0) {
    return { error: `Нельзя удалить: используется в ${usageCount} позици(ях) заказов` };
  }

  await prisma.catalogItemVariant.delete({ where: { id: variantId, catalogItemId } });
  revalidatePath(`/${orgSlug}/catalog/${catalogItemId}`);
  return {};
}

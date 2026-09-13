"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getOrgContext } from "@/lib/tenant";
import { assertPermission } from "@/lib/permissions";

export interface ActionResult {
  error?: string;
}

const setPriceSchema = z.object({
  value: z.coerce.number("Укажите цену").min(0, "Цена не может быть отрицательной"),
});

/** Upserts one (catalogItem, priceType) price — a value of "" clears the
 * row entirely (falls back to the item's own CatalogItem.unitPrice, same as
 * before this price type existed). */
export async function setCatalogItemPrice(
  orgSlug: string,
  catalogItemId: string,
  priceTypeId: string,
  rawValue: string,
): Promise<ActionResult> {
  const ctx = await getOrgContext(orgSlug);
  assertPermission(ctx, "catalog", "edit");

  const [item, priceType] = await Promise.all([
    prisma.catalogItem.findFirst({ where: { id: catalogItemId, orgId: ctx.orgId } }),
    prisma.priceType.findFirst({ where: { id: priceTypeId, orgId: ctx.orgId } }),
  ]);
  if (!item || !priceType) {
    return { error: "Товар или тип цены не найден" };
  }

  if (rawValue.trim() === "") {
    await prisma.catalogItemPrice.deleteMany({ where: { catalogItemId, priceTypeId } });
    revalidatePath(`/${orgSlug}/catalog/${catalogItemId}`);
    return {};
  }

  const parsed = setPriceSchema.safeParse({ value: rawValue });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Неверные данные" };
  }

  await prisma.catalogItemPrice.upsert({
    where: { catalogItemId_priceTypeId: { catalogItemId, priceTypeId } },
    create: { catalogItemId, priceTypeId, value: parsed.data.value, currency: item.currency },
    update: { value: parsed.data.value },
  });

  revalidatePath(`/${orgSlug}/catalog/${catalogItemId}`);
  return {};
}

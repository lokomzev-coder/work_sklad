"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getPlatformAdminContext, assertPlatformPermission } from "@/lib/platform-auth";

export interface PlatformActionResult {
  error?: string;
  id?: string;
}

const catalogItemSchema = z.object({
  key: z
    .string()
    .trim()
    .min(1, "Укажите ключ")
    .regex(/^[a-z0-9_]+$/, "Ключ — латиница/цифры/подчёркивание, без пробелов"),
  label: z.string().trim().min(1, "Укажите название"),
  description: z.string().trim().optional(),
  kind: z.enum(["FEATURE", "EXTRA_EMPLOYEE_SEAT"]),
  unitPrice: z.coerce.number().min(0, "Цена не может быть отрицательной"),
  includedInAllPlans: z.boolean().optional(),
});

export interface UpsertFeatureCatalogItemInput {
  key: string;
  label: string;
  description?: string;
  kind: "FEATURE" | "EXTRA_EMPLOYEE_SEAT";
  unitPrice: number;
  includedInAllPlans?: boolean;
}

/**
 * Блок Q — CRUD for the "Свой тариф" constructor's building blocks, same
 * shape as upsertSubscriptionPlan (actions/platform-subscription-plans.ts).
 * Deletion is refused, same principle as deletePlatformRole/
 * deleteSubscriptionPlan — archiving (status ARCHIVED) is how you retire an
 * item without invalidating historical invoices' planSnapshot, which
 * already froze whatever this item meant at the time it was purchased.
 */
export async function upsertFeatureCatalogItem(
  id: string | null,
  input: UpsertFeatureCatalogItemInput,
): Promise<PlatformActionResult> {
  const ctx = await getPlatformAdminContext();
  assertPlatformPermission(ctx, "manageSubscriptions");

  const parsed = catalogItemSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Неверные данные" };
  }

  const data = {
    key: parsed.data.key,
    label: parsed.data.label,
    description: parsed.data.description || null,
    kind: parsed.data.kind,
    unitPrice: parsed.data.unitPrice,
    includedInAllPlans: parsed.data.includedInAllPlans ?? false,
  };

  const existingByKey = await prisma.subscriptionFeatureCatalogItem.findUnique({ where: { key: data.key } });
  if (existingByKey && existingByKey.id !== id) {
    return { error: "Пункт с таким ключом уже существует" };
  }

  const item = id
    ? await prisma.subscriptionFeatureCatalogItem.update({ where: { id }, data })
    : await prisma.subscriptionFeatureCatalogItem.create({ data });

  await prisma.platformAuditLog.create({
    data: {
      platformAdminId: ctx.platformAdminId,
      action: id ? "FEATURE_ITEM_UPDATED" : "FEATURE_ITEM_CREATED",
      after: { id: item.id, key: item.key, label: item.label },
    },
  });

  revalidatePath("/admin/feature-catalog");
  return { id: item.id };
}

export async function setFeatureCatalogItemStatus(
  id: string,
  status: "ACTIVE" | "ARCHIVED",
): Promise<PlatformActionResult> {
  const ctx = await getPlatformAdminContext();
  assertPlatformPermission(ctx, "manageSubscriptions");

  const item = await prisma.subscriptionFeatureCatalogItem.update({ where: { id }, data: { status } });

  await prisma.platformAuditLog.create({
    data: {
      platformAdminId: ctx.platformAdminId,
      action: status === "ARCHIVED" ? "FEATURE_ITEM_ARCHIVED" : "FEATURE_ITEM_REACTIVATED",
      after: { id: item.id, key: item.key },
    },
  });

  revalidatePath("/admin/feature-catalog");
  return {};
}

"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getPlatformAdminContext, assertPlatformPermission } from "@/lib/platform-auth";

export interface PlatformActionResult {
  error?: string;
  id?: string;
}

const planSchema = z.object({
  name: z.string().trim().min(1, "Укажите название тарифа"),
  maxEmployees: z.coerce.number().int().positive().nullable(),
  maxOrdersPerMonth: z.coerce.number().int().positive().nullable(),
  priceMonthly: z.coerce.number().min(0, "Цена не может быть отрицательной"),
  currency: z.string().trim().min(1).default("RUB"),
  features: z.record(z.string(), z.boolean()).default({}),
});

export interface UpsertSubscriptionPlanInput {
  name: string;
  maxEmployees: number | null;
  maxOrdersPerMonth: number | null;
  priceMonthly: number;
  currency: string;
  features: Record<string, boolean>;
}

/** Блок L фаза 3 — tariff CRUD, gated by "manageSubscriptions". Deletion is
 * refused when an organization is currently on the plan (same
 * don't-silently-orphan-in-use-rows principle as deletePlatformRole,
 * actions/platform-roles.ts) — revoke/reassign those orgs first. */
export async function upsertSubscriptionPlan(
  id: string | null,
  input: UpsertSubscriptionPlanInput,
): Promise<PlatformActionResult> {
  const ctx = await getPlatformAdminContext();
  assertPlatformPermission(ctx, "manageSubscriptions");

  const parsed = planSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Неверные данные" };
  }

  const data = {
    name: parsed.data.name,
    maxEmployees: parsed.data.maxEmployees,
    maxOrdersPerMonth: parsed.data.maxOrdersPerMonth,
    priceMonthly: parsed.data.priceMonthly,
    currency: parsed.data.currency,
    features: parsed.data.features,
  };

  const plan = id
    ? await prisma.subscriptionPlan.update({ where: { id }, data })
    : await prisma.subscriptionPlan.create({ data });

  await prisma.platformAuditLog.create({
    data: {
      platformAdminId: ctx.platformAdminId,
      action: id ? "PLAN_UPDATED" : "PLAN_CREATED",
      after: { id: plan.id, name: plan.name },
    },
  });

  revalidatePath("/admin/plans");
  return { id: plan.id };
}

export async function deleteSubscriptionPlan(id: string): Promise<PlatformActionResult> {
  const ctx = await getPlatformAdminContext();
  assertPlatformPermission(ctx, "manageSubscriptions");

  const inUseCount = await prisma.organization.count({ where: { subscriptionPlanId: id } });
  if (inUseCount > 0) {
    return { error: `Тариф назначен ${inUseCount} организации(ям) — сначала смените им тариф` };
  }

  const plan = await prisma.subscriptionPlan.delete({ where: { id } });
  await prisma.platformAuditLog.create({
    data: { platformAdminId: ctx.platformAdminId, action: "PLAN_DELETED", before: { name: plan.name } },
  });

  revalidatePath("/admin/plans");
  return {};
}

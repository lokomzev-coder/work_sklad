"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { getPlatformAdminContext, assertPlatformPermission } from "@/lib/platform-auth";
import { creditBalance } from "@/lib/billing/subscription-billing";

export interface PlatformActionResult {
  error?: string;
}

/**
 * Блок L фаза 3 — grants, changes, or revokes an organization's
 * subscription (`planId: null` = revoke). Every call writes both a
 * `SubscriptionChangeLog` row (visible to the org itself — see its own
 * schema comment) and a `PlatformAuditLog` row (platform-internal) — two
 * different audiences for the same event, not duplication for its own
 * sake.
 */
export async function setOrganizationSubscription(
  orgId: string,
  planId: string | null,
  expiresAt: string | null,
): Promise<PlatformActionResult> {
  const ctx = await getPlatformAdminContext();
  assertPlatformPermission(ctx, "manageSubscriptions");

  const org = await prisma.organization.findUnique({ where: { id: orgId } });
  if (!org) {
    return { error: "Организация не найдена" };
  }
  if (planId) {
    const plan = await prisma.subscriptionPlan.findUnique({ where: { id: planId } });
    if (!plan) {
      return { error: "Тариф не найден" };
    }
  }

  const parsedExpiresAt = expiresAt ? new Date(expiresAt) : null;
  if (expiresAt && Number.isNaN(parsedExpiresAt?.getTime())) {
    return { error: "Некорректная дата окончания" };
  }

  const action = !org.subscriptionPlanId && planId ? "GRANTED" : !planId ? "REVOKED" : "CHANGED";

  await prisma.$transaction([
    prisma.organization.update({
      where: { id: orgId },
      data: { subscriptionPlanId: planId, subscriptionExpiresAt: parsedExpiresAt },
    }),
    prisma.subscriptionChangeLog.create({
      data: {
        orgId,
        platformAdminId: ctx.platformAdminId,
        action,
        beforePlanId: org.subscriptionPlanId,
        afterPlanId: planId,
        beforeExpiresAt: org.subscriptionExpiresAt,
        afterExpiresAt: parsedExpiresAt,
      },
    }),
    prisma.platformAuditLog.create({
      data: {
        platformAdminId: ctx.platformAdminId,
        action: `SUBSCRIPTION_${action}`,
        targetOrgId: orgId,
        before: { planId: org.subscriptionPlanId, expiresAt: org.subscriptionExpiresAt },
        after: { planId, expiresAt: parsedExpiresAt },
      },
    }),
  ]);

  revalidatePath(`/admin/organizations/${orgId}`);
  return {};
}

/**
 * Блок Q — manual balance top-up, the interim stand-in for a real payment
 * provider (docs/handbook/payment-provider-setup.md). Delegates to
 * lib/billing/subscription-billing.ts::creditBalance, which also
 * immediately retries the org's oldest PENDING invoice — a top-up here can
 * activate a tariff the org already picked without any further action from
 * either side, exactly like a real payment webhook would.
 */
export async function creditOrganizationBalance(
  orgId: string,
  amount: number,
  note: string,
): Promise<PlatformActionResult> {
  const ctx = await getPlatformAdminContext();
  assertPlatformPermission(ctx, "manageSubscriptions");

  if (!Number.isFinite(amount) || amount <= 0) {
    return { error: "Сумма пополнения должна быть больше нуля" };
  }

  const result = await creditBalance(orgId, amount, note.trim() || "Пополнение баланса из панели", ctx.platformAdminId);
  if (result.error) {
    return { error: result.error };
  }

  await prisma.platformAuditLog.create({
    data: {
      platformAdminId: ctx.platformAdminId,
      action: "BALANCE_TOPUP",
      targetOrgId: orgId,
      after: { amount, note, autoSettled: result.settled ?? false },
    },
  });

  revalidatePath(`/admin/organizations/${orgId}`);
  return {};
}

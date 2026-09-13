import { prisma } from "@/lib/prisma";
import type { Prisma } from "@/generated/prisma/client";

// Блок Q — named constants for the two clocks a subscription runs on. Kept
// here (not scattered as magic numbers) since both the billing engine and
// resolveSubscriptionState below need to agree on them exactly.
export const TRIAL_DAYS = 14;
export const RENEWAL_GRACE_DAYS = 7;

/** The subset of SubscriptionPlan fields any subscription-state consumer
 * needs — avoids forcing every caller to select the full model. */
export interface SubscriptionPlanLike {
  id: string;
  name: string;
  priceMonthly: Prisma.Decimal;
  currency: string;
  maxEmployees: number | null;
  maxOrdersPerMonth: number | null;
  // Block S — Record<featureKey, boolean>, matches
  // SubscriptionFeatureCatalogItem.key. See resolveEnabledFeatures below.
  features: Prisma.JsonValue;
}

export interface OrgSubscriptionFields {
  subscriptionPlanId: string | null;
  subscriptionExpiresAt: Date | null;
  trialEndsAt: Date | null;
  subscriptionPlan: SubscriptionPlanLike | null;
}

/**
 * Блок Q — the org's subscription state is always computed fresh from
 * these three fields, never stored as its own status column: same
 * philosophy as getPlatformAdminContext()'s capabilities and
 * getOrgContext()'s capabilities — a derived value can't drift out of sync
 * with the dates it's derived from.
 *
 * RESTRICTED is reachable two ways (trial ran out with no plan ever
 * bought, or a paid plan's renewal grace ran out) and means the same thing
 * either way: view access stays, every mutation is blocked (see
 * assertPermission in lib/permissions.ts).
 */
export type SubscriptionState =
  | { kind: "TRIAL"; endsAt: Date }
  | { kind: "ACTIVE"; plan: SubscriptionPlanLike; expiresAt: Date | null }
  | { kind: "GRACE"; plan: SubscriptionPlanLike; graceEndsAt: Date }
  | { kind: "RESTRICTED" };

export function resolveSubscriptionState(
  org: OrgSubscriptionFields,
  now: Date = new Date(),
): SubscriptionState {
  if (org.subscriptionPlanId && org.subscriptionPlan) {
    if (!org.subscriptionExpiresAt || org.subscriptionExpiresAt.getTime() >= now.getTime()) {
      return { kind: "ACTIVE", plan: org.subscriptionPlan, expiresAt: org.subscriptionExpiresAt };
    }
    const graceEndsAt = new Date(org.subscriptionExpiresAt.getTime() + RENEWAL_GRACE_DAYS * 86_400_000);
    if (now.getTime() <= graceEndsAt.getTime()) {
      return { kind: "GRACE", plan: org.subscriptionPlan, graceEndsAt };
    }
    return { kind: "RESTRICTED" };
  }
  if (org.trialEndsAt && org.trialEndsAt.getTime() >= now.getTime()) {
    return { kind: "TRIAL", endsAt: org.trialEndsAt };
  }
  return { kind: "RESTRICTED" };
}

/**
 * Блок L фаза 3 — subscription-limit checks, called alongside (never
 * instead of) `assertPermission` (Block I) at the relevant creation call
 * sites. An org with no active plan (`subscriptionPlanId: null`) or a plan
 * with `maxEmployees: null` is treated as unlimited on that axis — a
 * missing/expired subscription is a billing conversation for the platform
 * admin to have with the customer, not something that should silently
 * start blocking daily work mid-session for every org that hasn't been
 * assigned a tariff yet (most orgs at this point in the project, since
 * assignment is still 100% manual from the panel — see phase 3's own
 * ROADMAP.md note on this being one representative wiring, not exhaustive
 * coverage of every conceivable limit).
 */
/**
 * Block S — feature keys this app's OWN code actually consults today.
 * Anything else in SubscriptionFeatureCatalogItem is purely informational/
 * constructor-priced, not gated anywhere yet (see ROADMAP.md's scope note —
 * more gates are added the exact same way, one key + one call site).
 */
export const KNOWN_FEATURE_KEYS = {
  retail: "retail",
  production: "production",
  customRoles: "custom_roles",
} as const;

/**
 * The set of feature keys this ORG currently has access to: whatever its
 * plan's `features` map marks `true`, plus every catalog item marked
 * `includedInAllPlans` (free for everyone regardless of plan) — see
 * SubscriptionFeatureCatalogItem's own schema comment.
 */
export function resolveEnabledFeatures(
  planFeatures: Prisma.JsonValue | null | undefined,
  alwaysIncludedKeys: string[],
): Set<string> {
  const fromPlan =
    planFeatures && typeof planFeatures === "object" && !Array.isArray(planFeatures)
      ? Object.entries(planFeatures as Record<string, unknown>)
          .filter(([, v]) => v === true)
          .map(([k]) => k)
      : [];
  return new Set([...fromPlan, ...alwaysIncludedKeys]);
}

/**
 * Fail-open by design, same principle as `maxEmployees == null` above: if
 * the platform admin has never configured a catalog entry for this key at
 * all, nothing is actually restricting it yet, so every org keeps access —
 * otherwise deploying this gate would silently lock everyone out of a
 * feature the day the code ships, before anyone configured anything.
 * Restriction only starts once a real catalog item with this `key` exists
 * AND isn't included in the org's plan/`includedInAllPlans`.
 */
export function hasFeatureAccess(
  ctx: { enabledFeatures: Set<string>; configuredFeatureKeys: Set<string> },
  key: string,
): boolean {
  if (!ctx.configuredFeatureKeys.has(key)) return true;
  return ctx.enabledFeatures.has(key);
}

export function assertFeatureEnabled(
  ctx: { enabledFeatures: Set<string>; configuredFeatureKeys: Set<string> },
  key: string,
): void {
  if (!hasFeatureAccess(ctx, key)) {
    throw new Error(
      "Эта функция не входит в текущий тариф — докупите её или смените тариф на странице «Подписка».",
    );
  }
}

export async function checkEmployeeLimit(orgId: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const org = await prisma.organization.findUnique({
    where: { id: orgId },
    select: { subscriptionPlan: { select: { name: true, maxEmployees: true } } },
  });
  const maxEmployees = org?.subscriptionPlan?.maxEmployees;
  if (maxEmployees == null) {
    return { ok: true };
  }

  const currentCount = await prisma.employee.count({ where: { orgId, status: "ACTIVE" } });
  if (currentCount >= maxEmployees) {
    return {
      ok: false,
      error: `Тариф «${org!.subscriptionPlan!.name}» позволяет не больше ${maxEmployees} сотрудников — обратитесь к администратору для смены тарифа`,
    };
  }
  return { ok: true };
}

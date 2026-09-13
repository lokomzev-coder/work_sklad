import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma, withDbRetry } from "@/lib/prisma";
import type { Role } from "@/generated/prisma/enums";
import type { Resource, ResourcePermission } from "@/lib/permissions";
import { parseCustomRolePermissions, resolveCapabilities } from "@/lib/permissions";
import { setAuditActor } from "@/lib/audit-context";
import { resolveSubscriptionState, resolveEnabledFeatures, type SubscriptionState } from "@/lib/subscription";

export interface OrgContext {
  orgId: string;
  orgSlug: string;
  orgName: string;
  role: Role;
  userId: string;
  /** Set only if this login is linked to an Employee record (Block I
   * self-service) — null for the common case of a login with no matching
   * employee row. */
  employeeId: string | null;
  /** Block I2.1: this employee's department, if any — powers OWN_GROUP
   * scope (lib/scope.ts::resolveGroupMemberIds). Null if unassigned or no
   * linked Employee at all. */
  groupId: string | null;
  /** Set only if this Membership has a CustomRole assigned — used both to
   * resolve `capabilities` (below) and as one of the three who-can-transition
   * axes on DocumentStatusTransition (Block K). */
  customRoleId: string | null;
  /** True if the assigned CustomRole is a hidden "individual settings" role
   * (Block I2.1) rather than a named, reusable one — drives the toggle
   * default on the employee's Access card. */
  isIndividualRole: boolean;
  /** Block I2.1: fully resolved per-resource permissions for this request —
   * base Role defaults merged with the assigned CustomRole's overrides (see
   * resolveCapabilities in lib/permissions.ts). This is what `can()`/
   * `assertPermission()` read; computed once per request, zero extra
   * queries beyond what this function already runs. */
  capabilities: Record<Resource, ResourcePermission>;
  /** Block I2.2: this employee's default store, if any — a UI convenience
   * to pre-fill store selectors on new documents, not an access boundary. */
  defaultStoreId: string | null;
  /** Block I2.4: this employee's personal default legal entity, if set,
   * else the org's single `LegalEntity.isDefault` row, else null — same
   * cascading-default idea МойСклад uses (personal setting overrides the
   * org default). Pre-fills the legalEntityId selector on new Order/
   * PurchaseOrder documents; never enforced. */
  defaultLegalEntityId: string | null;
  /** Block M4 phase B: this employee's preference for PrintDialog's
   * "Скачать PDF" button — true opens the server-rendered PDF inline in a
   * new tab, false forces a save-as download. `false` (the Employee column's
   * own default) for logins with no linked Employee record too. */
  openPdfInBrowser: boolean;
  /** Блок Q — computed fresh every request from subscriptionPlanId/
   * subscriptionExpiresAt/trialEndsAt (see resolveSubscriptionState) —
   * read by assertPermission (lib/permissions.ts) to block mutations for
   * a RESTRICTED org, and by UI (dashboard banner, settings/subscription
   * page) to show trial/grace/restricted status. */
  subscriptionState: SubscriptionState;
  /** Block S — feature keys this org currently has access to (plan's
   * `features` map + every catalog item marked `includedInAllPlans`). Read
   * via `hasFeatureAccess`/`assertFeatureEnabled` (lib/subscription.ts),
   * never directly — those two also consult `configuredFeatureKeys` to
   * fail open on a key nobody has configured yet. */
  enabledFeatures: Set<string>;
  /** Block S — every feature key that exists in the catalog at all
   * (regardless of whether this org has it) — lets the gate tell "nobody
   * configured this yet" (allow) apart from "configured, but not included
   * for this org" (deny). */
  configuredFeatureKeys: Set<string>;
}

export async function getOrgContext(orgSlug: string): Promise<OrgContext> {
  const session = await auth();
  if (!session?.user) {
    redirect("/login");
  }

  const membership = (session.memberships ?? []).find((m) => m.orgSlug === orgSlug);
  if (!membership) {
    redirect("/org-select");
  }

  // Queried fresh (not cached in the JWT) so a scope/role change an admin
  // makes to a CustomRole takes effect on the very next request, not only
  // after the affected user's session token refreshes.
  // withDbRetry: this runs on literally every dashboard page load, making
  // it the single most exposed call site to the two-process `prisma dev`
  // cold-start collision documented on withDbRetry itself (lib/prisma.ts) —
  // previously unwrapped, so every page load was one of the two places this
  // failure surfaced with zero retry protection at all (the other being the
  // public API, which was wrapped but the retry classifier didn't actually
  // recognize this error until that was fixed too).
  const fullMembership = await withDbRetry(() =>
    prisma.membership.findFirst({
      where: { userId: session.user.id, orgId: membership.orgId },
      select: {
        employeeId: true,
        customRole: { select: { id: true, isIndividual: true, permissions: true } },
        employee: {
          select: { defaultStoreId: true, defaultLegalEntityId: true, groupId: true, openPdfInBrowser: true },
        },
        org: {
          select: {
            subscriptionPlanId: true,
            subscriptionExpiresAt: true,
            trialEndsAt: true,
            subscriptionPlan: {
              select: {
                id: true,
                name: true,
                priceMonthly: true,
                currency: true,
                maxEmployees: true,
                maxOrdersPerMonth: true,
                features: true,
              },
            },
          },
        },
      },
    }),
  );

  const subscriptionState = resolveSubscriptionState({
    subscriptionPlanId: fullMembership?.org?.subscriptionPlanId ?? null,
    subscriptionExpiresAt: fullMembership?.org?.subscriptionExpiresAt ?? null,
    trialEndsAt: fullMembership?.org?.trialEndsAt ?? null,
    subscriptionPlan: fullMembership?.org?.subscriptionPlan ?? null,
  });

  // Block S — small table, cheap to read fresh every request, same
  // reasoning as everything else here: a derived value (which features are
  // enabled) must never be cached somewhere it can drift out of sync with
  // the catalog/plan it's derived from.
  const featureCatalog = await prisma.subscriptionFeatureCatalogItem.findMany({
    where: { status: "ACTIVE" },
    select: { key: true, includedInAllPlans: true },
  });
  const configuredFeatureKeys = new Set(featureCatalog.map((f) => f.key));
  const alwaysIncludedKeys = featureCatalog.filter((f) => f.includedInAllPlans).map((f) => f.key);
  const enabledFeatures = resolveEnabledFeatures(
    fullMembership?.org?.subscriptionPlan?.features,
    alwaysIncludedKeys,
  );

  const override = fullMembership?.customRole
    ? parseCustomRolePermissions(fullMembership.customRole.permissions)
    : null;
  const capabilities = resolveCapabilities(membership.role, override);

  let defaultLegalEntityId = fullMembership?.employee?.defaultLegalEntityId ?? null;
  if (!defaultLegalEntityId) {
    const orgDefault = await prisma.legalEntity.findFirst({
      where: { orgId: membership.orgId, isDefault: true, status: "ACTIVE" },
      select: { id: true },
    });
    defaultLegalEntityId = orgDefault?.id ?? null;
  }

  // Block O phase 3: best-effort priming for the audit-log extension (see
  // lib/audit-context.ts's doc comment) — NOT reliable coverage on its own.
  // Confirmed experimentally: any `await prisma.*` between this call and an
  // action's actual mutation (assertRefsBelongToOrg, a permission lookup,
  // etc. — true for nearly every real action) loses the context before the
  // extension ever sees it. Kept here anyway (harmless, and covers the rare
  // action that mutates with zero other queries first), but dashboard
  // actions are NOT reliably audited in this version — only the /api/v1/*
  // routes are (they call setAuditActor again immediately before their own
  // mutation, in lib/api-guard.ts's callers). See ROADMAP.md Block O phase 3
  // for the honest scope note — this is a known gap, not a silent one.
  setAuditActor({
    orgId: membership.orgId,
    source: "UI",
    userId: session.user.id,
    label: session.user.name || session.user.email,
  });

  return {
    orgId: membership.orgId,
    orgSlug: membership.orgSlug,
    orgName: membership.orgName,
    role: membership.role,
    userId: session.user.id,
    employeeId: fullMembership?.employeeId ?? null,
    groupId: fullMembership?.employee?.groupId ?? null,
    customRoleId: fullMembership?.customRole?.id ?? null,
    isIndividualRole: fullMembership?.customRole?.isIndividual ?? false,
    capabilities,
    defaultStoreId: fullMembership?.employee?.defaultStoreId ?? null,
    defaultLegalEntityId,
    openPdfInBrowser: fullMembership?.employee?.openPdfInBrowser ?? false,
    subscriptionState,
    enabledFeatures,
    configuredFeatureKeys,
  };
}

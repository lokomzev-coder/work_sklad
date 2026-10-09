import { prisma } from "@/lib/prisma";
import { Prisma } from "@/generated/prisma/client";

/**
 * Блок Q — the balance-based billing engine. This is the single place that
 * turns a package/constructor selection into a SubscriptionInvoice, and an
 * invoice into an actually-active SubscriptionPlan on the Organization.
 * Called from three places today, and a fourth one later:
 *  - the org's own self-service subscription page (actions/subscription.ts)
 *  - the platform admin's manual balance top-up (actions/platform-subscriptions.ts)
 *  - the daily renewal cron (app/api/cron/subscription-renewal/route.ts)
 *  - (future) a real payment provider's webhook — see
 *    docs/handbook/payment-provider-setup.md, which points here explicitly:
 *    creditBalance() is the exact seam a webhook handler should call
 *    instead of the admin's manual top-up button.
 *
 * All amounts here go through Prisma.Decimal methods (.plus/.minus/.times/
 * .lessThan), never Number() — this is a real money ledger, the one place
 * in the app where float error would actually corrupt a balance, unlike
 * the ad hoc Number(decimal) conversions used elsewhere purely for display.
 */

export interface InvoiceSelectionPlan {
  kind: "PLAN";
  planId: string;
}
/**
 * Block V (explicit request, 2026-09-21) — the "Свой тариф" constructor and
 * the separate add-on-purchase list (CUSTOM/ADD_ON selection kinds) are
 * gone: an org can only buy one of the platform admin's fixed tariffs now,
 * МойСклад-style. `InvoiceSelection` is kept as its own type (rather than
 * inlining `{ kind: "PLAN"; planId }` at every call site) purely so a
 * future selection kind — e.g. a real payment-provider checkout — has one
 * obvious place to extend, per docs/handbook/payment-provider-setup.md.
 */
export type InvoiceSelection = InvoiceSelectionPlan;

export interface BillingResult {
  error?: string;
  invoiceId?: string;
  settled?: boolean;
}

/**
 * Turns a plan/constructor selection into a PENDING SubscriptionInvoice
 * (cancelling any previous PENDING invoice for the org — only one active
 * invoice at a time, never stacked), then immediately tries to pay it from
 * the org's current balance. If the balance already covers it, this one
 * call both creates the invoice AND activates the plan — the "формируется
 * счёт → оплата → автовыдача" flow the org sees as a single button press.
 */
export async function createOrDraftInvoice(
  orgId: string,
  selection: InvoiceSelection,
  reason: "PURCHASE" | "RENEWAL" = "PURCHASE",
): Promise<BillingResult> {
  const org = await prisma.organization.findUnique({
    where: { id: orgId },
    include: { subscriptionPlan: true },
  });
  if (!org) {
    return { error: "Организация не найдена" };
  }

  const plan = await prisma.subscriptionPlan.findUnique({ where: { id: selection.planId } });
  if (!plan || plan.isCustom) {
    return { error: "Тариф не найден" };
  }
  const planId = plan.id;
  const amount = plan.priceMonthly;
  const currency = plan.currency;
  const planSnapshot: Record<string, unknown> = {
    name: plan.name,
    maxEmployees: plan.maxEmployees,
    maxOrdersPerMonth: plan.maxOrdersPerMonth,
    features: plan.features,
    priceMonthly: plan.priceMonthly.toString(),
    currency: plan.currency,
  };

  if (currency !== org.baseCurrency) {
    return {
      error: `Валюта тарифа (${currency}) не совпадает с валютой организации (${org.baseCurrency}) — конвертация не поддерживается`,
    };
  }

  await prisma.subscriptionInvoice.updateMany({
    where: { orgId, status: "PENDING" },
    data: { status: "CANCELLED", cancelledAt: new Date() },
  });

  const last = await prisma.subscriptionInvoice.findFirst({
    where: { orgId },
    orderBy: { number: "desc" },
    select: { number: true },
  });
  const number = (last?.number ?? 0) + 1;

  const invoice = await prisma.subscriptionInvoice.create({
    data: {
      orgId,
      number,
      planId,
      planSnapshot: planSnapshot as Prisma.InputJsonValue,
      amount,
      currency,
      status: "PENDING",
      // Block V — always false going forward now that ADD_ON selections no
      // longer exist; attemptSettleInvoice's own isAddOn branch below is
      // left in place purely to keep any pre-existing PAID add-on invoice
      // rows interpreting correctly on a later retry, not because new
      // invoices can ever set it.
      isAddOn: false,
    },
  });

  const { settled } = await attemptSettleInvoice(invoice.id, { reason });
  return { invoiceId: invoice.id, settled };
}

/**
 * Pays a PENDING invoice from the org's balance if it now covers the
 * amount, and activates the plan in the same transaction — this is the
 * "автовыдача" itself. A no-op (not an error) if the balance is still
 * short; the invoice just stays PENDING for the next attempt (org retries
 * manually, or creditBalance()/the renewal cron retries it automatically).
 */
export async function attemptSettleInvoice(
  invoiceId: string,
  opts: { platformAdminId?: string | null; reason?: "PURCHASE" | "RENEWAL" } = {},
): Promise<{ settled: boolean }> {
  const { platformAdminId = null, reason = "PURCHASE" } = opts;
  const invoice = await prisma.subscriptionInvoice.findUnique({
    where: { id: invoiceId },
    include: { org: true },
  });
  if (!invoice || invoice.status !== "PENDING") {
    return { settled: false };
  }
  if (invoice.org.balance.lessThan(invoice.amount)) {
    return { settled: false };
  }

  const beforePlanId = invoice.org.subscriptionPlanId;
  const beforeExpiresAt = invoice.org.subscriptionExpiresAt;
  // ADD_ON buys more FEATURES on top of an already-active plan, not more
  // TIME — the org already paid for the current billing period, so its
  // expiry must be left exactly as-is (only if a period was already
  // running at all; an org with no plan yet has nothing to "add onto", so
  // an add-on purchase there behaves like any other first purchase). Read
  // from the invoice itself (not a call-time flag) so a LATER retry — a
  // balance top-up via creditBalance(), for instance — still applies the
  // same rule without its caller needing to know or re-pass anything.
  let afterExpiresAt: Date;
  if (invoice.isAddOn && beforePlanId && beforeExpiresAt) {
    afterExpiresAt = beforeExpiresAt;
  } else {
    // Renewing the same plan while still active extends from the current
    // expiry (never loses already-paid time); anything else (first
    // purchase, switching plans, or renewing after it already lapsed)
    // starts counting from now.
    const isLiveRenewalOfSamePlan =
      beforePlanId === invoice.planId && beforeExpiresAt !== null && beforeExpiresAt.getTime() > Date.now();
    const baseDate = isLiveRenewalOfSamePlan ? beforeExpiresAt! : new Date();
    afterExpiresAt = new Date(baseDate);
    afterExpiresAt.setMonth(afterExpiresAt.getMonth() + invoice.periodMonths);
  }

  const newBalance = invoice.org.balance.minus(invoice.amount);
  const action = beforePlanId ? "CHANGED" : "GRANTED";

  await prisma.$transaction([
    prisma.organization.update({
      where: { id: invoice.orgId },
      data: { balance: newBalance, subscriptionPlanId: invoice.planId, subscriptionExpiresAt: afterExpiresAt },
    }),
    prisma.subscriptionInvoice.update({
      where: { id: invoice.id },
      data: { status: "PAID", paidAt: new Date() },
    }),
    prisma.balanceTransaction.create({
      data: {
        orgId: invoice.orgId,
        type: "INVOICE_PAYMENT",
        amount: invoice.amount.negated(),
        balanceAfter: newBalance,
        relatedInvoiceId: invoice.id,
        note: `Оплата счёта №${invoice.number}`,
      },
    }),
    prisma.subscriptionChangeLog.create({
      data: {
        orgId: invoice.orgId,
        platformAdminId: null,
        action,
        beforePlanId,
        afterPlanId: invoice.planId,
        beforeExpiresAt,
        afterExpiresAt,
      },
    }),
    prisma.platformAuditLog.create({
      data: {
        platformAdminId,
        action: reason === "RENEWAL" ? "SUBSCRIPTION_AUTO_RENEWED" : "SUBSCRIPTION_SELF_SERVICE_PURCHASE",
        targetOrgId: invoice.orgId,
        before: { planId: beforePlanId, expiresAt: beforeExpiresAt },
        after: { planId: invoice.planId, expiresAt: afterExpiresAt, invoiceId: invoice.id, amount: invoice.amount.toString() },
      },
    }),
  ]);

  return { settled: true };
}

/**
 * Credits the org's balance and immediately retries its oldest PENDING
 * invoice — this is what makes a top-up feel like "автовыдача", not two
 * separate manual steps. `platformAdminId` is set when a platform admin
 * does this by hand (today's only path, until a payment provider is
 * chosen — see docs/handbook/payment-provider-setup.md); a future
 * provider webhook would call this the same way with platformAdminId left
 * null (an automated credit, not a human one).
 */
export async function creditBalance(
  orgId: string,
  amount: Prisma.Decimal | number,
  note: string,
  platformAdminId: string | null,
): Promise<BillingResult> {
  const decimalAmount = amount instanceof Prisma.Decimal ? amount : new Prisma.Decimal(amount);
  if (decimalAmount.lessThanOrEqualTo(0)) {
    return { error: "Сумма пополнения должна быть больше нуля" };
  }

  const org = await prisma.organization.findUnique({ where: { id: orgId } });
  if (!org) {
    return { error: "Организация не найдена" };
  }

  const newBalance = org.balance.plus(decimalAmount);
  await prisma.$transaction([
    prisma.organization.update({ where: { id: orgId }, data: { balance: newBalance } }),
    prisma.balanceTransaction.create({
      data: {
        orgId,
        type: "TOPUP",
        amount: decimalAmount,
        balanceAfter: newBalance,
        platformAdminId,
        note,
      },
    }),
  ]);

  const pendingInvoice = await prisma.subscriptionInvoice.findFirst({
    where: { orgId, status: "PENDING" },
    orderBy: { createdAt: "asc" },
  });
  if (pendingInvoice) {
    const { settled } = await attemptSettleInvoice(pendingInvoice.id, { platformAdminId });
    return { settled };
  }
  return { settled: false };
}

/**
 * Блок Q — the daily renewal sweep (app/api/cron/subscription-renewal).
 * For every org whose paid plan has reached (or passed) its
 * subscriptionExpiresAt, retries payment from balance once a day — this is
 * what actually renews a subscription automatically rather than only when
 * someone happens to open the subscription page. Reuses (never
 * duplicates) an already-PENDING renewal invoice for the same plan so a
 * week-long GRACE window doesn't create seven separate invoices — just
 * seven retries against the same one, exactly one of which needs to
 * succeed.
 */
export async function runSubscriptionRenewals(): Promise<{ processed: number; settled: number }> {
  const dueOrgs = await prisma.organization.findMany({
    where: { subscriptionPlanId: { not: null }, subscriptionExpiresAt: { lte: new Date() } },
    select: { id: true, subscriptionPlanId: true },
  });

  let settledCount = 0;
  for (const org of dueOrgs) {
    if (!org.subscriptionPlanId) continue;
    const existingPending = await prisma.subscriptionInvoice.findFirst({
      where: { orgId: org.id, planId: org.subscriptionPlanId, status: "PENDING" },
      orderBy: { createdAt: "desc" },
    });
    if (existingPending) {
      const { settled } = await attemptSettleInvoice(existingPending.id, { reason: "RENEWAL" });
      if (settled) settledCount += 1;
    } else {
      const result = await createOrDraftInvoice(org.id, { kind: "PLAN", planId: org.subscriptionPlanId }, "RENEWAL");
      if (result.settled) settledCount += 1;
    }
  }

  return { processed: dueOrgs.length, settled: settledCount };
}

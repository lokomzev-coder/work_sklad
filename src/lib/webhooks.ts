import { createHmac } from "node:crypto";
import { prisma } from "@/lib/prisma";
import type { WebhookEvent } from "@/generated/prisma/enums";
import type { Prisma } from "@/generated/prisma/client";

const DELIVERY_TIMEOUT_MS = 5_000;

// Block M3: retry queue. Delay (minutes) before attempts 2/3/4 respectively,
// after the previous one failed. MAX_ATTEMPTS = length + 1 (the initial
// dispatch is attempt 1). Deliberately short and fixed, not a configurable
// production job queue — 1 minute for the first retry specifically so a
// live end-to-end check can observe it without an unreasonable wait.
const RETRY_DELAYS_MINUTES = [1, 10, 60];
// Exported so page.tsx (server-side) can show "attempt N/MAX_ATTEMPTS" in
// the UI without duplicating the number — never import this from a "use
// client" component, this module pulls in prisma/pg.
export const MAX_ATTEMPTS = RETRY_DELAYS_MINUTES.length + 1;

// How many due deliveries one /api/cron/webhook-retries invocation claims —
// bounds a single call's HTTP fan-out and execution time regardless of how
// large the backlog is.
const RETRY_BATCH_SIZE = 50;

/**
 * Best-effort outbound notification (Block H4) — fire-and-forget HTTP POST,
 * signed with HMAC-SHA256 over the raw body. Callers deliberately do NOT
 * await this so a slow/unreachable endpoint can't stall the create/update
 * Server Action the user is waiting on; DELIVERY_TIMEOUT_MS just bounds how
 * long the orphaned promise runs in the background. Relies on the dev
 * server being a long-running process (not a serverless function that gets
 * frozen right after the response).
 *
 * Block M3: a failed delivery isn't lost — it's retried with exponential
 * backoff by retryPendingDeliveries() below, driven externally by whatever
 * scheduler hits /api/cron/webhook-retries (no in-process background-job
 * infra exists in this project, so the retry loop only advances when that
 * route is actually called).
 */
export async function dispatchWebhookEvent(
  orgId: string,
  event: WebhookEvent,
  payload: Record<string, unknown>,
): Promise<void> {
  const webhooks = await prisma.webhook.findMany({
    where: { orgId, isActive: true, events: { has: event } },
  });
  if (webhooks.length === 0) return;

  const body = { event, payload, timestamp: new Date().toISOString() };
  const bodyStr = JSON.stringify(body);

  await Promise.all(
    webhooks.map((webhook) => deliverAndRecord(webhook.id, webhook.url, webhook.secret, event, bodyStr, body)),
  );
}

async function attemptHttpDelivery(
  url: string,
  secret: string,
  bodyStr: string,
): Promise<{ success: boolean; statusCode?: number; error?: string }> {
  const signature = createHmac("sha256", secret).update(bodyStr).digest("hex");
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), DELIVERY_TIMEOUT_MS);

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-WorkSklad-Signature": signature,
      },
      body: bodyStr,
      signal: controller.signal,
    });
    return { success: res.ok, statusCode: res.status };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : "Unknown error" };
  } finally {
    clearTimeout(timeout);
  }
}

/** delayMinutes to schedule before the NEXT attempt, given the attemptCount
 * that just failed — or null if MAX_ATTEMPTS has been reached (give up). */
function nextRetryDelayMinutes(attemptCount: number): number | null {
  if (attemptCount >= MAX_ATTEMPTS) return null;
  return RETRY_DELAYS_MINUTES[attemptCount - 1] ?? null;
}

function dueAt(delayMinutes: number | null): Date | null {
  return delayMinutes === null ? null : new Date(Date.now() + delayMinutes * 60_000);
}

async function deliverAndRecord(
  webhookId: string,
  url: string,
  secret: string,
  event: WebhookEvent,
  bodyStr: string,
  payload: Record<string, unknown>,
): Promise<void> {
  const result = await attemptHttpDelivery(url, secret, bodyStr);
  await prisma.webhookDelivery.create({
    data: {
      webhookId,
      event,
      payload: payload as unknown as Prisma.InputJsonValue,
      statusCode: result.statusCode,
      success: result.success,
      error: result.error,
      attemptCount: 1,
      nextRetryAt: result.success ? null : dueAt(nextRetryDelayMinutes(1)),
    },
  });
}

/**
 * Block K (scenarios): delivers to ONE specific webhook (the one a
 * scenario's SEND_WEBHOOK action names), not every subscriber of an event
 * like dispatchWebhookEvent above. Reuses deliverAndRecord so this lands in
 * the exact same WebhookDelivery log/retry queue as ordinary webhook
 * traffic — a scenario-triggered delivery that fails gets picked up by the
 * same retryPendingDeliveries()/cron route for free. Fire-and-forget for
 * the same reason dispatchWebhookEvent is: an outbound HTTP call must never
 * stall the Server Action that triggered the scenario.
 */
export function deliverToWebhookNow(
  orgId: string,
  webhookId: string,
  event: WebhookEvent,
  payload: Record<string, unknown>,
): void {
  void (async () => {
    const webhook = await prisma.webhook.findFirst({
      where: { id: webhookId, orgId, isActive: true },
    });
    if (!webhook) return;
    const body = { event, payload, timestamp: new Date().toISOString() };
    await deliverAndRecord(webhook.id, webhook.url, webhook.secret, event, JSON.stringify(body), body);
  })();
}

export interface RetryResult {
  attempted: number;
  succeeded: number;
  failed: number;
}

/**
 * Block M3: called by GET /api/cron/webhook-retries on whatever schedule an
 * external scheduler hits it with (Vercel Cron, a GitHub Actions workflow,
 * a plain crontab, etc — deploy platform is still undecided, see ROADMAP
 * Block L, so this stays scheduler-agnostic). Retries every WebhookDelivery
 * whose nextRetryAt has come due, using the payload captured at dispatch
 * time. No tenant/org scoping here on purpose — this is a system job
 * spanning every organization's webhooks, not a request-scoped Server
 * Action; don't "fix" that by adding a getOrgContext-style check, it would
 * break the retry loop entirely.
 *
 * Due rows are claimed (nextRetryAt cleared) inside one transaction before
 * any HTTP call is made, so two overlapping invocations of this route
 * (e.g. an overrunning batch plus a scheduler retry) can't both deliver the
 * same row twice. This doesn't close a literal race at the millisecond
 * level (would need `FOR UPDATE SKIP LOCKED`), but it closes the realistic
 * case of two scheduler ticks overlapping because a previous batch ran long.
 */
export async function retryPendingDeliveries(now: Date = new Date()): Promise<RetryResult> {
  const claimed = await prisma.$transaction(async (tx) => {
    const due = await tx.webhookDelivery.findMany({
      where: { nextRetryAt: { lte: now } },
      orderBy: { nextRetryAt: "asc" },
      take: RETRY_BATCH_SIZE,
      include: { webhook: true },
    });
    if (due.length === 0) return [];

    await tx.webhookDelivery.updateMany({
      where: { id: { in: due.map((d) => d.id) }, nextRetryAt: { lte: now } },
      data: { nextRetryAt: null },
    });
    return due;
  });

  let succeeded = 0;
  let failed = 0;

  await Promise.allSettled(
    claimed.map(async (delivery) => {
      if (!delivery.webhook.isActive) {
        // Cancelled, not attempted — the org turned this webhook off since
        // the failed attempt that scheduled this retry.
        return;
      }

      const bodyStr = JSON.stringify(delivery.payload);
      const result = await attemptHttpDelivery(delivery.webhook.url, delivery.webhook.secret, bodyStr);
      const attemptCount = delivery.attemptCount + 1;

      await prisma.webhookDelivery.update({
        where: { id: delivery.id },
        data: {
          statusCode: result.statusCode,
          success: result.success,
          error: result.error,
          attemptCount,
          nextRetryAt: result.success ? null : dueAt(nextRetryDelayMinutes(attemptCount)),
        },
      });

      if (result.success) succeeded++;
      else failed++;
    }),
  );

  return { attempted: claimed.length, succeeded, failed };
}

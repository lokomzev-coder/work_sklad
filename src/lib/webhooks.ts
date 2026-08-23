import { createHmac } from "node:crypto";
import { prisma } from "@/lib/prisma";
import type { WebhookEvent } from "@/generated/prisma/enums";

const DELIVERY_TIMEOUT_MS = 5_000;

/**
 * Best-effort outbound notification (Block H4) — no retry queue (no
 * background-job infra exists in this project), so a failed delivery is
 * just logged to WebhookDelivery for the user to notice. Callers
 * deliberately do NOT await this (it's fire-and-forget) so a slow/unreachable
 * endpoint can't stall the create/update Server Action the user is waiting
 * on; DELIVERY_TIMEOUT_MS just bounds how long the orphaned promise runs in
 * the background. Relies on the dev server being a long-running process
 * (not a serverless function that gets frozen right after the response).
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

  const body = JSON.stringify({ event, payload, timestamp: new Date().toISOString() });

  await Promise.all(webhooks.map((webhook) => deliver(webhook.id, webhook.url, webhook.secret, event, body)));
}

async function deliver(
  webhookId: string,
  url: string,
  secret: string,
  event: WebhookEvent,
  body: string,
): Promise<void> {
  const signature = createHmac("sha256", secret).update(body).digest("hex");
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), DELIVERY_TIMEOUT_MS);

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-EasyWork-Signature": signature,
      },
      body,
      signal: controller.signal,
    });
    await prisma.webhookDelivery.create({
      data: { webhookId, event, statusCode: res.status, success: res.ok },
    });
  } catch (err) {
    await prisma.webhookDelivery.create({
      data: {
        webhookId,
        event,
        success: false,
        error: err instanceof Error ? err.message : "Unknown error",
      },
    });
  } finally {
    clearTimeout(timeout);
  }
}

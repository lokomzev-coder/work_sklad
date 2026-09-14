"use server";

import { revalidatePath } from "next/cache";
import { randomBytes } from "node:crypto";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getOrgContext } from "@/lib/tenant";
import { assertPermission } from "@/lib/permissions";
import { assertPublicWebhookUrl, UnsafeWebhookUrlError } from "@/lib/ssrf-guard";
import type { WebhookEvent } from "@/generated/prisma/enums";

export interface ActionResult {
  error?: string;
}

const createSchema = z.object({
  url: z.url("Введите корректный URL"),
  events: z.array(z.string()).min(1, "Выберите хотя бы одно событие"),
});

export async function createWebhook(
  orgSlug: string,
  _prevState: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const ctx = await getOrgContext(orgSlug);
  assertPermission(ctx, "webhooks", "create");

  const parsed = createSchema.safeParse({
    url: formData.get("url"),
    events: formData.getAll("events"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Неверные данные" };
  }

  // Security fix (external review, 2026-09-13): reject internal/private
  // targets at save time — see lib/ssrf-guard.ts for why this is checked
  // here AND again at every delivery attempt.
  try {
    await assertPublicWebhookUrl(parsed.data.url);
  } catch (err) {
    if (err instanceof UnsafeWebhookUrlError) return { error: err.message };
    throw err;
  }

  await prisma.webhook.create({
    data: {
      orgId: ctx.orgId,
      url: parsed.data.url,
      secret: randomBytes(24).toString("hex"),
      events: parsed.data.events as WebhookEvent[],
    },
  });

  revalidatePath(`/${orgSlug}/settings/webhooks`);
  return {};
}

export async function toggleWebhookActive(orgSlug: string, webhookId: string, isActive: boolean) {
  const ctx = await getOrgContext(orgSlug);
  assertPermission(ctx, "webhooks", "edit");

  await prisma.webhook.update({
    where: { id: webhookId, orgId: ctx.orgId },
    data: { isActive },
  });

  revalidatePath(`/${orgSlug}/settings/webhooks`);
}

export async function deleteWebhook(orgSlug: string, webhookId: string) {
  const ctx = await getOrgContext(orgSlug);
  assertPermission(ctx, "webhooks", "delete");

  await prisma.webhook.delete({ where: { id: webhookId, orgId: ctx.orgId } });

  revalidatePath(`/${orgSlug}/settings/webhooks`);
}

/**
 * Block M3: jumps a pending retry to "due now" instead of waiting out its
 * scheduled backoff — the next /api/cron/webhook-retries invocation picks
 * it up. No-op (silently) if the delivery has no pending retry (already
 * succeeded, permanently failed, or never failed at all) — nothing to
 * escalate in that case, not an error.
 */
export async function retryWebhookDeliveryNow(orgSlug: string, deliveryId: string) {
  const ctx = await getOrgContext(orgSlug);
  assertPermission(ctx, "webhooks", "edit");

  await prisma.webhookDelivery.updateMany({
    where: { id: deliveryId, nextRetryAt: { not: null }, webhook: { orgId: ctx.orgId } },
    data: { nextRetryAt: new Date() },
  });

  revalidatePath(`/${orgSlug}/settings/webhooks`);
}

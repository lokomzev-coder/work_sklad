"use server";

import { revalidatePath } from "next/cache";
import { randomBytes } from "node:crypto";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getOrgContext } from "@/lib/tenant";
import { assertPermission } from "@/lib/permissions";
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
  assertPermission(ctx.role, "settings", "edit");

  const parsed = createSchema.safeParse({
    url: formData.get("url"),
    events: formData.getAll("events"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Неверные данные" };
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
  assertPermission(ctx.role, "settings", "edit");

  await prisma.webhook.update({
    where: { id: webhookId, orgId: ctx.orgId },
    data: { isActive },
  });

  revalidatePath(`/${orgSlug}/settings/webhooks`);
}

export async function deleteWebhook(orgSlug: string, webhookId: string) {
  const ctx = await getOrgContext(orgSlug);
  assertPermission(ctx.role, "settings", "edit");

  await prisma.webhook.delete({ where: { id: webhookId, orgId: ctx.orgId } });

  revalidatePath(`/${orgSlug}/settings/webhooks`);
}

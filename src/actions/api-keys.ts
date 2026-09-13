"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getOrgContext } from "@/lib/tenant";
import { assertPermission } from "@/lib/permissions";
import { generateApiKey, hashApiKey, keyPrefixFor } from "@/lib/api-keys";

export interface ActionResult {
  error?: string;
}

const createSchema = z.object({
  name: z.string().trim().min(1, "Укажите название ключа").max(200),
});

export interface CreateApiKeyResult extends ActionResult {
  /** The plaintext key — present only in this one response, never again
   * (only its hash is persisted). The caller must show it to the user now
   * and warn that it won't be shown a second time. */
  plaintextKey?: string;
}

export async function createApiKey(orgSlug: string, name: string): Promise<CreateApiKeyResult> {
  const ctx = await getOrgContext(orgSlug);
  assertPermission(ctx, "apiKeys", "create");

  const parsed = createSchema.safeParse({ name });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Неверные данные" };
  }

  const plaintextKey = generateApiKey();
  await prisma.apiKey.create({
    data: {
      orgId: ctx.orgId,
      name: parsed.data.name,
      keyHash: hashApiKey(plaintextKey),
      keyPrefix: keyPrefixFor(plaintextKey),
      createdById: ctx.employeeId,
    },
  });

  revalidatePath(`/${orgSlug}/settings/api-keys`);
  return { plaintextKey };
}

export async function revokeApiKey(orgSlug: string, apiKeyId: string): Promise<ActionResult> {
  const ctx = await getOrgContext(orgSlug);
  assertPermission(ctx, "apiKeys", "delete");

  const key = await prisma.apiKey.findFirst({ where: { id: apiKeyId, orgId: ctx.orgId } });
  if (!key) {
    return { error: "Ключ не найден" };
  }
  if (key.revokedAt) {
    return {};
  }

  await prisma.apiKey.update({ where: { id: apiKeyId }, data: { revokedAt: new Date() } });

  revalidatePath(`/${orgSlug}/settings/api-keys`);
  return {};
}

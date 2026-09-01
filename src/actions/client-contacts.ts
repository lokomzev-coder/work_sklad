"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { getOrgContext } from "@/lib/tenant";
import { assertPermission } from "@/lib/permissions";
import { assertRowScope } from "@/lib/scope";
import { clientContactSchema } from "@/lib/validation/client-contact";

export interface ActionResult {
  error?: string;
}

export async function createClientContact(
  orgSlug: string,
  clientId: string,
  _prevState: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const ctx = await getOrgContext(orgSlug);
  assertPermission(ctx, "clients", "edit");
  await assertRowScope(ctx, "clients", clientId);

  const parsed = clientContactSchema.safeParse({
    name: formData.get("name"),
    position: formData.get("position"),
    phone: formData.get("phone"),
    email: formData.get("email"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Неверные данные" };
  }

  const client = await prisma.client.findFirst({ where: { id: clientId, orgId: ctx.orgId } });
  if (!client) {
    return { error: "Клиент не найден" };
  }

  await prisma.clientContact.create({ data: { ...parsed.data, clientId } });

  revalidatePath(`/${orgSlug}/clients/${clientId}`);
  return {};
}

export async function deleteClientContact(orgSlug: string, clientId: string, contactId: string) {
  const ctx = await getOrgContext(orgSlug);
  assertPermission(ctx, "clients", "edit");
  await assertRowScope(ctx, "clients", clientId);

  const client = await prisma.client.findFirst({ where: { id: clientId, orgId: ctx.orgId } });
  if (!client) {
    throw new Error("Клиент не найден");
  }

  await prisma.clientContact.delete({ where: { id: contactId, clientId } });
  revalidatePath(`/${orgSlug}/clients/${clientId}`);
}

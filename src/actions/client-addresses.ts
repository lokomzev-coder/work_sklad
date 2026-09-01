"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { getOrgContext } from "@/lib/tenant";
import { assertPermission } from "@/lib/permissions";
import { assertRowScope } from "@/lib/scope";
import { clientAddressSchema } from "@/lib/validation/client-address";

export interface ActionResult {
  error?: string;
}

export async function createClientAddress(
  orgSlug: string,
  clientId: string,
  _prevState: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const ctx = await getOrgContext(orgSlug);
  assertPermission(ctx, "clients", "edit");
  await assertRowScope(ctx, "clients", clientId);

  const parsed = clientAddressSchema.safeParse({
    label: formData.get("label"),
    address: formData.get("address"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Неверные данные" };
  }

  const client = await prisma.client.findFirst({ where: { id: clientId, orgId: ctx.orgId } });
  if (!client) {
    return { error: "Клиент не найден" };
  }

  await prisma.clientAddress.create({ data: { ...parsed.data, clientId } });

  revalidatePath(`/${orgSlug}/clients/${clientId}`);
  return {};
}

export async function deleteClientAddress(orgSlug: string, clientId: string, addressId: string) {
  const ctx = await getOrgContext(orgSlug);
  assertPermission(ctx, "clients", "edit");
  await assertRowScope(ctx, "clients", clientId);

  const client = await prisma.client.findFirst({ where: { id: clientId, orgId: ctx.orgId } });
  if (!client) {
    throw new Error("Клиент не найден");
  }

  await prisma.clientAddress.delete({ where: { id: addressId, clientId } });
  revalidatePath(`/${orgSlug}/clients/${clientId}`);
}

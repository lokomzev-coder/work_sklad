"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getOrgContext } from "@/lib/tenant";
import { assertPermission } from "@/lib/permissions";
import { clientSchema } from "@/lib/validation/client";
import { archiveOrDelete } from "@/lib/archive";

export interface ActionResult {
  error?: string;
}

function parseClientForm(formData: FormData) {
  return clientSchema.safeParse({
    name: formData.get("name"),
    inn: formData.get("inn"),
    email: formData.get("email"),
    phone: formData.get("phone"),
    address: formData.get("address"),
    kpp: formData.get("kpp"),
    ogrn: formData.get("ogrn"),
    bankName: formData.get("bankName"),
    bankBik: formData.get("bankBik"),
    bankAccount: formData.get("bankAccount"),
  });
}

export async function createClient(
  orgSlug: string,
  _prevState: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const ctx = await getOrgContext(orgSlug);
  assertPermission(ctx.role, "clients", "edit");

  const parsed = parseClientForm(formData);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Неверные данные" };
  }

  await prisma.client.create({
    data: { ...parsed.data, orgId: ctx.orgId },
  });

  revalidatePath(`/${orgSlug}/clients`);
  redirect(`/${orgSlug}/clients`);
}

export async function updateClient(
  orgSlug: string,
  clientId: string,
  _prevState: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const ctx = await getOrgContext(orgSlug);
  assertPermission(ctx.role, "clients", "edit");

  const parsed = parseClientForm(formData);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Неверные данные" };
  }

  await prisma.client.update({
    where: { id: clientId, orgId: ctx.orgId },
    data: parsed.data,
  });

  revalidatePath(`/${orgSlug}/clients`);
  redirect(`/${orgSlug}/clients`);
}

export async function archiveClient(orgSlug: string, clientId: string) {
  const ctx = await getOrgContext(orgSlug);
  assertPermission(ctx.role, "clients", "edit");

  await prisma.client.update({
    where: { id: clientId, orgId: ctx.orgId },
    data: { status: "ARCHIVED", archivedAt: new Date() },
  });

  revalidatePath(`/${orgSlug}/clients`);
}

export async function restoreClient(orgSlug: string, clientId: string) {
  const ctx = await getOrgContext(orgSlug);
  assertPermission(ctx.role, "clients", "edit");

  await prisma.client.update({
    where: { id: clientId, orgId: ctx.orgId },
    data: { status: "ACTIVE", archivedAt: null },
  });

  revalidatePath(`/${orgSlug}/clients`);
}

export async function deleteClient(orgSlug: string, clientId: string) {
  const ctx = await getOrgContext(orgSlug);
  assertPermission(ctx.role, "clients", "edit");

  const result = await archiveOrDelete("client", clientId, ctx.orgId);

  revalidatePath(`/${orgSlug}/clients`);
  return result;
}

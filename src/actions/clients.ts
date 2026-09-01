"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getOrgContext } from "@/lib/tenant";
import { assertPermission } from "@/lib/permissions";
import { assertRowScope } from "@/lib/scope";
import { clientSchema } from "@/lib/validation/client";
import { archiveOrDelete } from "@/lib/archive";
import { saveCustomFieldValues } from "@/lib/custom-fields";

export interface ActionResult {
  error?: string;
}

export interface QuickCreateClientResult {
  client?: { id: string; name: string };
  error?: string;
}

/** Minimal client creation used by inline "+ create" pickers in Order/PurchaseOrder/
 * Contract/Payment forms — unlike `createClient`, returns the created record instead
 * of redirecting, so the caller can select it in-place without leaving the page. */
export async function quickCreateClient(
  orgSlug: string,
  input: { name: string; phone?: string; email?: string },
): Promise<QuickCreateClientResult> {
  const ctx = await getOrgContext(orgSlug);
  assertPermission(ctx, "clients", "create");

  const parsed = clientSchema.pick({ name: true, phone: true, email: true }).safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Неверные данные" };
  }

  const client = await prisma.client.create({
    data: { ...parsed.data, orgId: ctx.orgId, assignedEmployeeId: ctx.employeeId },
  });

  revalidatePath(`/${orgSlug}/clients`);
  return { client: { id: client.id, name: client.name } };
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
  assertPermission(ctx, "clients", "create");

  const parsed = parseClientForm(formData);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Неверные данные" };
  }

  const client = await prisma.client.create({
    data: { ...parsed.data, orgId: ctx.orgId, assignedEmployeeId: ctx.employeeId },
  });
  await saveCustomFieldValues(ctx.orgId, "CLIENT", client.id, formData);

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
  assertPermission(ctx, "clients", "edit");
  await assertRowScope(ctx, "clients", clientId);

  const parsed = parseClientForm(formData);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Неверные данные" };
  }

  await prisma.client.update({
    where: { id: clientId, orgId: ctx.orgId },
    data: parsed.data,
  });
  await saveCustomFieldValues(ctx.orgId, "CLIENT", clientId, formData);

  revalidatePath(`/${orgSlug}/clients`);
  redirect(`/${orgSlug}/clients`);
}

export async function archiveClient(orgSlug: string, clientId: string) {
  const ctx = await getOrgContext(orgSlug);
  assertPermission(ctx, "clients", "edit");
  await assertRowScope(ctx, "clients", clientId);

  await prisma.client.update({
    where: { id: clientId, orgId: ctx.orgId },
    data: { status: "ARCHIVED", archivedAt: new Date() },
  });

  revalidatePath(`/${orgSlug}/clients`);
}

export async function restoreClient(orgSlug: string, clientId: string) {
  const ctx = await getOrgContext(orgSlug);
  assertPermission(ctx, "clients", "edit");
  await assertRowScope(ctx, "clients", clientId);

  await prisma.client.update({
    where: { id: clientId, orgId: ctx.orgId },
    data: { status: "ACTIVE", archivedAt: null },
  });

  revalidatePath(`/${orgSlug}/clients`);
}

export async function deleteClient(orgSlug: string, clientId: string) {
  const ctx = await getOrgContext(orgSlug);
  assertPermission(ctx, "clients", "delete");
  await assertRowScope(ctx, "clients", clientId);

  const result = await archiveOrDelete("client", clientId, ctx.orgId);

  revalidatePath(`/${orgSlug}/clients`);
  return result;
}

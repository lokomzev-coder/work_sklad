"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getOrgContext } from "@/lib/tenant";
import { assertPermission } from "@/lib/permissions";
import { archiveOrDelete, type ArchiveOrDeleteResult } from "@/lib/archive";
import { getOrgDek } from "@/lib/org-dek";
import { encryptSecret, decryptSecret } from "@/lib/crypto";
import { vaultEntrySchema } from "@/lib/validation/vault";

export interface ActionResult {
  error?: string;
}

function parseVaultEntryForm(formData: FormData) {
  return vaultEntrySchema.safeParse({
    serviceName: formData.get("serviceName"),
    url: formData.get("url"),
    username: formData.get("username"),
    notes: formData.get("notes"),
  });
}

export async function createVaultEntry(
  orgSlug: string,
  _prevState: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const ctx = await getOrgContext(orgSlug);
  assertPermission(ctx.role, "vault", "edit");

  const parsed = parseVaultEntryForm(formData);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Неверные данные" };
  }

  const secret = formData.get("secret");
  if (typeof secret !== "string" || secret.length === 0) {
    return { error: "Введите пароль или секрет" };
  }

  const dek = await getOrgDek(ctx.orgId);
  const { ciphertext, nonce, authTag } = encryptSecret(dek, secret);

  await prisma.vaultServiceEntry.create({
    data: { ...parsed.data, orgId: ctx.orgId, ciphertext, nonce, authTag },
  });

  revalidatePath(`/${orgSlug}/vault`);
  redirect(`/${orgSlug}/vault`);
}

export async function updateVaultEntry(
  orgSlug: string,
  entryId: string,
  _prevState: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const ctx = await getOrgContext(orgSlug);
  assertPermission(ctx.role, "vault", "edit");

  const parsed = parseVaultEntryForm(formData);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Неверные данные" };
  }

  // Secret is write-only and optional on edit: a blank field means "keep
  // the existing secret" rather than "clear it".
  const secret = formData.get("secret");
  const secretUpdate =
    typeof secret === "string" && secret.length > 0
      ? encryptSecret(await getOrgDek(ctx.orgId), secret)
      : null;

  await prisma.vaultServiceEntry.update({
    where: { id: entryId, orgId: ctx.orgId },
    data: {
      ...parsed.data,
      ...(secretUpdate ?? {}),
    },
  });

  revalidatePath(`/${orgSlug}/vault`);
  redirect(`/${orgSlug}/vault`);
}

export async function archiveVaultEntry(orgSlug: string, entryId: string) {
  const ctx = await getOrgContext(orgSlug);
  assertPermission(ctx.role, "vault", "edit");

  await prisma.vaultServiceEntry.update({
    where: { id: entryId, orgId: ctx.orgId },
    data: { status: "ARCHIVED", archivedAt: new Date() },
  });

  revalidatePath(`/${orgSlug}/vault`);
}

export async function restoreVaultEntry(orgSlug: string, entryId: string) {
  const ctx = await getOrgContext(orgSlug);
  assertPermission(ctx.role, "vault", "edit");

  await prisma.vaultServiceEntry.update({
    where: { id: entryId, orgId: ctx.orgId },
    data: { status: "ACTIVE", archivedAt: null },
  });

  revalidatePath(`/${orgSlug}/vault`);
}

export async function deleteVaultEntry(
  orgSlug: string,
  entryId: string,
): Promise<ArchiveOrDeleteResult> {
  const ctx = await getOrgContext(orgSlug);
  assertPermission(ctx.role, "vault", "edit");

  const result = await archiveOrDelete("vaultServiceEntry", entryId, ctx.orgId);

  revalidatePath(`/${orgSlug}/vault`);
  return result;
}

export async function grantVaultAccess(
  orgSlug: string,
  vaultEntryId: string,
  employeeId: string,
) {
  const ctx = await getOrgContext(orgSlug);
  assertPermission(ctx.role, "vault", "edit");

  const employee = await prisma.employee.findFirstOrThrow({
    where: { id: employeeId, orgId: ctx.orgId },
  });

  // One EMPLOYEE_ACCESS tag per employee, reused across every entry they're
  // granted access to -- created lazily on first grant, never duplicated.
  const tag = await prisma.tag.upsert({
    where: { orgId_name: { orgId: ctx.orgId, name: employee.fullName } },
    create: {
      orgId: ctx.orgId,
      name: employee.fullName,
      kind: "EMPLOYEE_ACCESS",
      sourceEmployeeId: employee.id,
    },
    update: {},
  });

  await prisma.employeeVaultAccess.upsert({
    where: { employeeId_vaultEntryId: { employeeId, vaultEntryId } },
    create: { employeeId, vaultEntryId, grantedById: ctx.userId },
    update: {},
  });

  await prisma.tagOnVaultEntry.upsert({
    where: { tagId_vaultEntryId: { tagId: tag.id, vaultEntryId } },
    create: { tagId: tag.id, vaultEntryId },
    update: {},
  });

  revalidatePath(`/${orgSlug}/vault/${vaultEntryId}`);
}

export async function revokeVaultAccess(
  orgSlug: string,
  vaultEntryId: string,
  employeeId: string,
) {
  const ctx = await getOrgContext(orgSlug);
  assertPermission(ctx.role, "vault", "edit");

  const employee = await prisma.employee.findFirst({
    where: { id: employeeId, orgId: ctx.orgId },
  });

  await prisma.employeeVaultAccess.deleteMany({
    where: { employeeId, vaultEntryId },
  });

  // Drop the tag<->entry link for this entry, but keep the Tag itself: the
  // employee may still have access to other entries carrying the same tag.
  if (employee) {
    const tag = await prisma.tag.findUnique({
      where: { orgId_name: { orgId: ctx.orgId, name: employee.fullName } },
    });
    if (tag) {
      await prisma.tagOnVaultEntry.deleteMany({
        where: { tagId: tag.id, vaultEntryId },
      });
    }
  }

  revalidatePath(`/${orgSlug}/vault/${vaultEntryId}`);
}

export interface RevealSecretResult {
  secret?: string;
  error?: string;
}

export async function revealVaultSecret(
  orgSlug: string,
  entryId: string,
): Promise<RevealSecretResult> {
  const ctx = await getOrgContext(orgSlug);
  assertPermission(ctx.role, "vault", "read");

  const entry = await prisma.vaultServiceEntry.findFirst({
    where: { id: entryId, orgId: ctx.orgId },
  });
  if (!entry) {
    return { error: "Запись не найдена" };
  }

  const dek = await getOrgDek(ctx.orgId);
  const secret = decryptSecret(dek, {
    ciphertext: entry.ciphertext,
    nonce: entry.nonce,
    authTag: entry.authTag,
  });

  await prisma.vaultAccessLog.create({
    data: { vaultEntryId: entryId, userId: ctx.userId, action: "VIEW_SECRET" },
  });

  return { secret };
}

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
import { canAccessVaultEntry } from "@/lib/vault-scope";

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
  assertPermission(ctx, "vault", "create");

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

  const entry = await prisma.vaultServiceEntry.create({
    data: { ...parsed.data, orgId: ctx.orgId, ciphertext, nonce, authTag },
  });

  // Security fix (external review, 2026-09-13): once vault access is
  // grant-scoped (OWN, see lib/permissions.ts's MANAGER default), a creator
  // who isn't ADMIN would otherwise be unable to see the entry they just
  // made until someone else granted it back to them. Auto-granting the
  // creator closes that usability gap without weakening the fix — everyone
  // ELSE still needs an explicit grant.
  if (ctx.employeeId) {
    await grantAccessRecord(ctx.orgId, ctx.employeeId, entry.id, ctx.userId);
  }

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
  assertPermission(ctx, "vault", "edit");
  if (!(await canAccessVaultEntry(ctx, entryId, "edit"))) {
    return { error: "Запись не найдена" };
  }

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
  assertPermission(ctx, "vault", "edit");
  if (!(await canAccessVaultEntry(ctx, entryId, "edit"))) {
    throw new Error("Запись не найдена");
  }

  await prisma.vaultServiceEntry.update({
    where: { id: entryId, orgId: ctx.orgId },
    data: { status: "ARCHIVED", archivedAt: new Date() },
  });

  revalidatePath(`/${orgSlug}/vault`);
}

export async function restoreVaultEntry(orgSlug: string, entryId: string) {
  const ctx = await getOrgContext(orgSlug);
  assertPermission(ctx, "vault", "edit");
  if (!(await canAccessVaultEntry(ctx, entryId, "edit"))) {
    throw new Error("Запись не найдена");
  }

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
  assertPermission(ctx, "vault", "delete");
  if (!(await canAccessVaultEntry(ctx, entryId, "edit"))) {
    return { reason: "Запись не найдена" };
  }

  const result = await archiveOrDelete("vaultServiceEntry", entryId, ctx.orgId);

  revalidatePath(`/${orgSlug}/vault`);
  return result;
}

/** Shared by grantVaultAccess and createVaultEntry's creator auto-grant —
 * one EMPLOYEE_ACCESS tag per employee, reused across every entry they're
 * granted access to, created lazily on first grant, never duplicated. */
async function grantAccessRecord(orgId: string, employeeId: string, vaultEntryId: string, grantedById: string) {
  const employee = await prisma.employee.findFirstOrThrow({
    where: { id: employeeId, orgId },
  });

  const tag = await prisma.tag.upsert({
    where: { orgId_name: { orgId, name: employee.fullName } },
    create: {
      orgId,
      name: employee.fullName,
      kind: "EMPLOYEE_ACCESS",
      sourceEmployeeId: employee.id,
    },
    update: {},
  });

  await prisma.employeeVaultAccess.upsert({
    where: { employeeId_vaultEntryId: { employeeId, vaultEntryId } },
    create: { employeeId, vaultEntryId, grantedById },
    update: {},
  });

  await prisma.tagOnVaultEntry.upsert({
    where: { tagId_vaultEntryId: { tagId: tag.id, vaultEntryId } },
    create: { tagId: tag.id, vaultEntryId },
    update: {},
  });
}

export async function grantVaultAccess(
  orgSlug: string,
  vaultEntryId: string,
  employeeId: string,
) {
  const ctx = await getOrgContext(orgSlug);
  assertPermission(ctx, "vault", "create");
  // Security fix (external review, 2026-09-13): without this check, a
  // grant-scoped (OWN) user who has NOT been granted this entry could
  // still call grantVaultAccess to grant it to themselves (or anyone
  // else) — trivially bypassing the whole scoping fix. Must already be
  // able to edit the entry to hand out access to it.
  if (!(await canAccessVaultEntry(ctx, vaultEntryId, "edit"))) {
    throw new Error("Запись не найдена");
  }

  await grantAccessRecord(ctx.orgId, employeeId, vaultEntryId, ctx.userId);

  revalidatePath(`/${orgSlug}/vault/${vaultEntryId}`);
}

export async function revokeVaultAccess(
  orgSlug: string,
  vaultEntryId: string,
  employeeId: string,
) {
  const ctx = await getOrgContext(orgSlug);
  assertPermission(ctx, "vault", "delete");
  if (!(await canAccessVaultEntry(ctx, vaultEntryId, "edit"))) {
    throw new Error("Запись не найдена");
  }

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
  assertPermission(ctx, "vault", "view");
  // Security fix (external review, 2026-09-13) — this was the actual
  // vulnerability: assertPermission only confirmed the role can view
  // "the vault resource" in general (NONE/ALL), never whether THIS entry
  // was ever granted to this employee via EmployeeVaultAccess. Same
  // "not found", not a distinct "forbidden", so a caller can't probe
  // whether an ungranted entry id exists at all.
  if (!(await canAccessVaultEntry(ctx, entryId, "view"))) {
    return { error: "Запись не найдена" };
  }

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

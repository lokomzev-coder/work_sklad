"use server";

import crypto from "node:crypto";
import { revalidatePath } from "next/cache";
import bcrypt from "bcryptjs";
import { TOTP, Secret } from "otpauth";
import * as QRCode from "qrcode";
import { prisma } from "@/lib/prisma";
import { encryptWithMasterKey, decryptWithMasterKey } from "@/lib/crypto";
import { getPlatformAdminContext, assertPlatformPermission, getAdminBasePath } from "@/lib/platform-auth";

export interface PlatformActionResult {
  error?: string;
  id?: string;
}

const SETUP_TOKEN_TTL_MS = 24 * 60 * 60 * 1000;

/**
 * Блок L фаза 2 — invites a new (non-owner) platform admin. Deliberately
 * creates the row with no password and no TOTP secret — only a one-time
 * setupToken. The inviter chooses email/name/role, but must NEVER choose
 * (or see) the new admin's password or 2FA secret; if they could, 2FA
 * would only ever be as strong as the inviter's own account. The setup
 * link is returned to the caller to relay out-of-band (this project sends
 * no email anywhere — same convention as everywhere else) — it is the
 * new admin's only credential until they complete setup.
 */
export async function invitePlatformAdmin(
  email: string,
  name: string,
  platformRoleId: string | null,
): Promise<PlatformActionResult & { setupPath?: string }> {
  const ctx = await getPlatformAdminContext();
  assertPlatformPermission(ctx, "manageAdmins");

  const trimmedEmail = email.trim().toLowerCase();
  const trimmedName = name.trim();
  if (!trimmedEmail || !trimmedName) {
    return { error: "Укажите email и имя" };
  }

  const existing = await prisma.platformAdmin.findUnique({ where: { email: trimmedEmail } });
  if (existing) {
    return { error: "Администратор с таким email уже существует" };
  }

  if (platformRoleId) {
    const role = await prisma.platformRole.findUnique({ where: { id: platformRoleId } });
    if (!role) {
      return { error: "Роль не найдена" };
    }
  }

  const setupToken = crypto.randomBytes(32).toString("base64url");
  const admin = await prisma.platformAdmin.create({
    data: {
      email: trimmedEmail,
      name: trimmedName,
      platformRoleId,
      setupToken,
      setupTokenExpiresAt: new Date(Date.now() + SETUP_TOKEN_TTL_MS),
    },
  });

  await prisma.platformAuditLog.create({
    data: {
      platformAdminId: ctx.platformAdminId,
      action: "ADMIN_INVITED",
      targetOrgId: null,
      after: { id: admin.id, email: admin.email, platformRoleId },
    },
  });

  revalidatePath("/admin/admins");
  return { id: admin.id, setupPath: `${getAdminBasePath()}/setup/${setupToken}` };
}

export async function updatePlatformAdminRole(id: string, platformRoleId: string | null): Promise<PlatformActionResult> {
  const ctx = await getPlatformAdminContext();
  assertPlatformPermission(ctx, "manageAdmins");

  const admin = await prisma.platformAdmin.findUnique({ where: { id } });
  if (!admin) {
    return { error: "Администратор не найден" };
  }
  if (admin.isOwner) {
    return { error: "У головного аккаунта роль не назначается — у него всегда полный доступ" };
  }
  if (platformRoleId) {
    const role = await prisma.platformRole.findUnique({ where: { id: platformRoleId } });
    if (!role) {
      return { error: "Роль не найдена" };
    }
  }

  await prisma.platformAdmin.update({ where: { id }, data: { platformRoleId } });
  await prisma.platformAuditLog.create({
    data: {
      platformAdminId: ctx.platformAdminId,
      action: "ADMIN_ROLE_CHANGED",
      before: { platformRoleId: admin.platformRoleId },
      after: { platformRoleId },
    },
  });

  revalidatePath("/admin/admins");
  return {};
}

/** Пресекает деактивацию головного аккаунта и самого себя (иначе
 * платформенный админ с manageAdmins мог бы случайно/злонамеренно
 * отрезать себе доступ без возможности восстановиться самостоятельно). */
export async function setPlatformAdminStatus(
  id: string,
  status: "ACTIVE" | "ARCHIVED",
): Promise<PlatformActionResult> {
  const ctx = await getPlatformAdminContext();
  assertPlatformPermission(ctx, "manageAdmins");

  const admin = await prisma.platformAdmin.findUnique({ where: { id } });
  if (!admin) {
    return { error: "Администратор не найден" };
  }
  if (admin.isOwner) {
    return { error: "Головной аккаунт нельзя деактивировать" };
  }
  if (admin.id === ctx.platformAdminId) {
    return { error: "Нельзя деактивировать самого себя" };
  }

  await prisma.platformAdmin.update({ where: { id }, data: { status } });
  await prisma.platformAuditLog.create({
    data: {
      platformAdminId: ctx.platformAdminId,
      action: status === "ACTIVE" ? "ADMIN_REACTIVATED" : "ADMIN_DEACTIVATED",
      before: { status: admin.status },
      after: { status },
    },
  });

  revalidatePath("/admin/admins");
  return {};
}

export interface SetupStartResult {
  error?: string;
  qrDataUrl?: string;
  base32?: string;
}

/**
 * Step 1 of self-service setup (public page, gated by the token itself —
 * no admin session exists yet). Sets the new admin's own chosen password
 * and generates a fresh TOTP secret, but does NOT finalize/enable it yet —
 * `confirmPlatformAdminSetup` below does that only once the admin proves
 * they can actually generate a valid code from it. Re-callable (a
 * re-scanned QR replaces the previous unconfirmed one) as long as the
 * token hasn't been consumed or expired.
 */
export async function startPlatformAdminSetup(token: string, password: string): Promise<SetupStartResult> {
  if (password.length < 12) {
    return { error: "Пароль должен быть не короче 12 символов" };
  }

  const admin = await prisma.platformAdmin.findFirst({
    where: { setupToken: token, setupTokenExpiresAt: { gt: new Date() } },
  });
  if (!admin) {
    return { error: "Ссылка недействительна или устарела" };
  }

  const passwordHash = await bcrypt.hash(password, 12);
  const secret = new Secret({ size: 20 });
  const totp = new TOTP({ issuer: "EasyWork Admin", label: admin.email, secret });
  const { wrapped, nonce } = encryptWithMasterKey(secret.base32);

  await prisma.platformAdmin.update({
    where: { id: admin.id },
    data: { passwordHash, totpSecretEnc: wrapped, totpSecretNonce: nonce, totpEnabledAt: null },
  });

  const qrDataUrl = await QRCode.toDataURL(totp.toString());
  return { qrDataUrl, base32: secret.base32 };
}

export interface SetupConfirmResult {
  error?: string;
  success?: boolean;
}

/** Step 2 — proves the admin actually captured the TOTP secret (not just
 * that the server generated one), then consumes the setup token so it
 * can't be reused or discovered later. */
export async function confirmPlatformAdminSetup(token: string, code: string): Promise<SetupConfirmResult> {
  const admin = await prisma.platformAdmin.findFirst({
    where: { setupToken: token, setupTokenExpiresAt: { gt: new Date() } },
  });
  if (!admin || !admin.totpSecretEnc || !admin.totpSecretNonce) {
    return { error: "Ссылка недействительна или устарела. Начните заново." };
  }

  const secretBase32 = decryptWithMasterKey(admin.totpSecretEnc, admin.totpSecretNonce);
  const totp = new TOTP({ secret: Secret.fromBase32(secretBase32) });
  const delta = totp.validate({ token: code.trim(), window: 1 });
  if (delta === null) {
    return { error: "Код не подошёл" };
  }

  await prisma.platformAdmin.update({
    where: { id: admin.id },
    data: { totpEnabledAt: new Date(), setupToken: null, setupTokenExpiresAt: null },
  });
  await prisma.platformAuditLog.create({
    data: { platformAdminId: admin.id, action: "ADMIN_SETUP_COMPLETED" },
  });

  return { success: true };
}

"use server";

import bcrypt from "bcryptjs";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { getOrgContext } from "@/lib/tenant";
import {
  updateOwnProfileSchema,
  changeOwnPasswordSchema,
  updateOwnDefaultsSchema,
} from "@/lib/validation/profile";

export interface LinkMyEmployeeResult {
  error?: string;
}

/**
 * Block W (explicit request, 2026-09-22) — self-service fix for a real
 * onboarding gap: registering via /register creates a Membership with no
 * Employee at all (actions/auth.ts never sets one), and several actions
 * (uploads, tasks, cash orders, comments, counterparty adjustments) require
 * `ctx.employeeId` for attribution — so the founding admin could log in and
 * immediately be unable to upload a product photo, with an error mentioning
 * "employee link" and no way to actually fix it themselves. Either links to
 * an existing Employee with no login yet (`existingEmployeeId`), or creates
 * a brand-new one named after the account. No permission gate — this only
 * ever touches the caller's own Membership, same self-service bar as
 * updateOwnDefaults above.
 */
export async function linkMyEmployee(
  orgSlug: string,
  existingEmployeeId: string | null,
): Promise<LinkMyEmployeeResult> {
  const ctx = await getOrgContext(orgSlug);
  if (ctx.employeeId) {
    return { error: "Аккаунт уже привязан к карточке сотрудника" };
  }

  const membership = await prisma.membership.findFirst({ where: { userId: ctx.userId, orgId: ctx.orgId } });
  if (!membership) return { error: "Не удалось найти аккаунт в этой организации" };

  let employeeId = existingEmployeeId;
  if (employeeId) {
    const employee = await prisma.employee.findFirst({ where: { id: employeeId, orgId: ctx.orgId } });
    if (!employee) return { error: "Сотрудник не найден" };
    const alreadyLinked = await prisma.membership.findFirst({ where: { employeeId, orgId: ctx.orgId } });
    if (alreadyLinked) return { error: "У этого сотрудника уже есть свой вход" };
  } else {
    const user = await prisma.user.findUniqueOrThrow({ where: { id: ctx.userId }, select: { name: true } });
    const created = await prisma.employee.create({ data: { orgId: ctx.orgId, fullName: user.name } });
    employeeId = created.id;
  }

  await prisma.membership.update({ where: { id: membership.id }, data: { employeeId } });

  revalidatePath(`/${orgSlug}/settings/profile`);
  return {};
}

export interface ActionResult {
  error?: string;
  success?: boolean;
}

async function requireUserId(): Promise<string> {
  const session = await auth();
  if (!session?.user) throw new Error("Не авторизован");
  return session.user.id;
}

/**
 * Block I2.3 — self-service profile. `User` is shared across every org the
 * person belongs to, so a name/email change here is intentionally visible
 * everywhere at once (same person, not a per-org profile).
 */
export async function updateOwnProfile(
  orgSlug: string,
  _prevState: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const userId = await requireUserId();
  const parsed = updateOwnProfileSchema.safeParse({
    name: formData.get("name"),
    email: formData.get("email"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Неверные данные" };
  }

  await prisma.user.update({
    where: { id: userId },
    data: { name: parsed.data.name, email: parsed.data.email },
  });

  revalidatePath(`/${orgSlug}/settings/profile`);
  revalidatePath(`/${orgSlug}/floor/profile`);
  return { success: true };
}

export async function changeOwnPassword(
  orgSlug: string,
  _prevState: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const userId = await requireUserId();
  const parsed = changeOwnPasswordSchema.safeParse({
    currentPassword: formData.get("currentPassword"),
    newPassword: formData.get("newPassword"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Неверные данные" };
  }

  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
  const matches = await bcrypt.compare(parsed.data.currentPassword, user.passwordHash);
  if (!matches) {
    return { error: "Текущий пароль неверен" };
  }

  const passwordHash = await bcrypt.hash(parsed.data.newPassword, 12);
  await prisma.user.update({ where: { id: userId }, data: { passwordHash } });

  revalidatePath(`/${orgSlug}/settings/profile`);
  revalidatePath(`/${orgSlug}/floor/profile`);
  return { success: true };
}

/**
 * Block I2.4 — self-service document defaults (default store, default legal
 * entity), on the SAME Employee row an admin can also edit from the
 * employee card (`actions/employees.ts::updateEmployee`) — this is just a
 * second, narrower entry point for the person themselves, so it's not
 * gated by `assertPermission(ctx, "employees", ...)` at all: an EMPLOYEE
 * role only has view access to "employees", but must still be able to set
 * their own convenience defaults. No-ops with an error if this login has no
 * linked Employee record (a login with no Employee has nothing to default).
 */
export async function updateOwnDefaults(
  orgSlug: string,
  _prevState: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const ctx = await getOrgContext(orgSlug);
  if (!ctx.employeeId) {
    return { error: "Этот логин не привязан к карточке сотрудника — некому назначать значения по умолчанию" };
  }

  const parsed = updateOwnDefaultsSchema.safeParse({
    defaultStoreId: formData.get("defaultStoreId") || null,
    defaultLegalEntityId: formData.get("defaultLegalEntityId") || null,
    openPdfInBrowser: formData.get("openPdfInBrowser"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Неверные данные" };
  }

  if (parsed.data.defaultStoreId) {
    const store = await prisma.store.findFirst({ where: { id: parsed.data.defaultStoreId, orgId: ctx.orgId } });
    if (!store) return { error: "Склад не найден" };
  }
  if (parsed.data.defaultLegalEntityId) {
    const legalEntity = await prisma.legalEntity.findFirst({
      where: { id: parsed.data.defaultLegalEntityId, orgId: ctx.orgId },
    });
    if (!legalEntity) return { error: "Юрлицо не найдено" };
  }

  await prisma.employee.update({
    where: { id: ctx.employeeId, orgId: ctx.orgId },
    data: {
      defaultStoreId: parsed.data.defaultStoreId ?? null,
      defaultLegalEntityId: parsed.data.defaultLegalEntityId ?? null,
      openPdfInBrowser: parsed.data.openPdfInBrowser ?? false,
    },
  });

  revalidatePath(`/${orgSlug}/settings/profile`);
  revalidatePath(`/${orgSlug}/floor/profile`);
  return { success: true };
}

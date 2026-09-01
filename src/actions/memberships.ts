"use server";

import { revalidatePath } from "next/cache";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getOrgContext } from "@/lib/tenant";
import { assertPermission } from "@/lib/permissions";

export interface ActionResult {
  error?: string;
}

const LOGIN_REGEX = /^[a-z0-9](?:[a-z0-9._-]{0,48}[a-z0-9])?$/;

const grantSchema = z.object({
  login: z.string().trim().toLowerCase().regex(LOGIN_REGEX, "Логин: латиница/цифры, без пробелов и @"),
  email: z.email("Некорректный email"),
  password: z.string().trim().min(8, "Минимум 8 символов").max(200).optional(),
  role: z.enum(["ADMIN", "MANAGER", "EMPLOYEE", "PRODUCTION"]),
  customRoleId: z.string().optional(),
});

/**
 * Grants an existing Employee a personal login (Block I self-service). If a
 * User already exists with this email (they're already on the platform in
 * another org), the Membership links to that existing account and the
 * submitted password is ignored — inviting someone doesn't get to set their
 * password for them. Otherwise a brand-new User is created and `password`
 * is required.
 */
export async function grantEmployeeAccess(
  orgSlug: string,
  employeeId: string,
  _prevState: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const ctx = await getOrgContext(orgSlug);
  assertPermission(ctx, "employees", "edit");
  assertPermission(ctx, "membership", "create");

  const parsed = grantSchema.safeParse({
    login: formData.get("login"),
    email: formData.get("email"),
    password: formData.get("password") || undefined,
    role: formData.get("role"),
    customRoleId: formData.get("customRoleId") || undefined,
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Неверные данные" };
  }

  const employee = await prisma.employee.findFirst({ where: { id: employeeId, orgId: ctx.orgId } });
  if (!employee) return { error: "Сотрудник не найден" };

  const existingMembership = await prisma.membership.findFirst({ where: { employeeId, orgId: ctx.orgId } });
  if (existingMembership) return { error: "У сотрудника уже есть доступ" };

  if (parsed.data.customRoleId) {
    const role = await prisma.customRole.findFirst({ where: { id: parsed.data.customRoleId, orgId: ctx.orgId } });
    if (!role) return { error: "Роль не найдена" };
  }

  const existingUser = await prisma.user.findUnique({ where: { email: parsed.data.email } });
  if (!existingUser && !parsed.data.password) {
    return { error: "Введите пароль для нового пользователя" };
  }
  const passwordHash = existingUser ? null : await bcrypt.hash(parsed.data.password!, 12);

  try {
    await prisma.$transaction(async (tx) => {
      const user =
        existingUser ??
        (await tx.user.create({
          data: { name: employee.fullName, email: parsed.data.email, passwordHash: passwordHash! },
        }));
      await tx.membership.create({
        data: {
          userId: user.id,
          orgId: ctx.orgId,
          role: parsed.data.role,
          login: parsed.data.login,
          employeeId,
          customRoleId: parsed.data.customRoleId ?? null,
        },
      });
    });
  } catch {
    return { error: "Такой логин уже занят в этой организации" };
  }

  revalidatePath(`/${orgSlug}/employees/${employeeId}`);
  return {};
}

export async function revokeEmployeeAccess(orgSlug: string, employeeId: string) {
  const ctx = await getOrgContext(orgSlug);
  assertPermission(ctx, "membership", "delete");

  // Block I2.1: an individual role only ever belongs to one Membership —
  // revoking access orphans it, so clean it up rather than leaving a dead
  // row behind (named roles are left alone; other memberships may use them).
  const membership = await prisma.membership.findFirst({
    where: { employeeId, orgId: ctx.orgId },
    include: { customRole: { select: { id: true, isIndividual: true } } },
  });

  await prisma.membership.deleteMany({ where: { employeeId, orgId: ctx.orgId } });
  if (membership?.customRole?.isIndividual) {
    await prisma.customRole.delete({ where: { id: membership.customRole.id } }).catch(() => {});
  }

  revalidatePath(`/${orgSlug}/employees/${employeeId}`);
}

const updateSchema = z.object({
  role: z.enum(["ADMIN", "MANAGER", "EMPLOYEE", "PRODUCTION"]),
  customRoleId: z.string().optional(),
});

export async function updateEmployeeAccess(
  orgSlug: string,
  employeeId: string,
  formData: FormData,
) {
  const ctx = await getOrgContext(orgSlug);
  assertPermission(ctx, "membership", "edit");

  const parsed = updateSchema.safeParse({
    role: formData.get("role"),
    customRoleId: formData.get("customRoleId") || undefined,
  });
  if (!parsed.success) return;

  if (parsed.data.customRoleId) {
    const role = await prisma.customRole.findFirst({ where: { id: parsed.data.customRoleId, orgId: ctx.orgId } });
    if (!role) return;
  }

  const existing = await prisma.membership.findFirst({
    where: { employeeId, orgId: ctx.orgId },
    include: { customRole: { select: { id: true, isIndividual: true } } },
  });

  await prisma.membership.updateMany({
    where: { employeeId, orgId: ctx.orgId },
    data: { role: parsed.data.role, customRoleId: parsed.data.customRoleId ?? null },
  });

  // Switching away from an individual role orphans it (see revokeEmployeeAccess).
  if (existing?.customRole?.isIndividual && existing.customRole.id !== parsed.data.customRoleId) {
    await prisma.customRole.delete({ where: { id: existing.customRole.id } }).catch(() => {});
  }

  revalidatePath(`/${orgSlug}/employees/${employeeId}`);
}

/**
 * Block I2.1 — "Индивидуальные настройки" on an employee's Access card:
 * ensures the Membership has its own hidden CustomRole (creating one, empty,
 * if it doesn't already) and returns its id so the UI can link to the
 * matrix editor. Idempotent — calling this again on an already-individual
 * membership just returns the existing role's id, doesn't reset it.
 */
export async function switchToIndividualRole(
  orgSlug: string,
  employeeId: string,
): Promise<ActionResult & { roleId?: string }> {
  const ctx = await getOrgContext(orgSlug);
  assertPermission(ctx, "membership", "edit");

  const membership = await prisma.membership.findFirst({
    where: { employeeId, orgId: ctx.orgId },
    include: { customRole: { select: { id: true, isIndividual: true } } },
  });
  if (!membership) return { error: "Доступ не найден" };
  if (membership.customRole?.isIndividual) return { roleId: membership.customRole.id };

  // A previously-assigned NAMED role (if any) is left untouched — it may be
  // shared with other memberships, only individual roles get cleaned up.
  const role = await prisma.customRole.create({
    data: {
      orgId: ctx.orgId,
      name: `__individual__${employeeId}`,
      isIndividual: true,
      permissions: { version: 2, resources: {} },
    },
  });
  await prisma.membership.update({ where: { id: membership.id }, data: { customRoleId: role.id } });

  revalidatePath(`/${orgSlug}/employees/${employeeId}`);
  return { roleId: role.id };
}

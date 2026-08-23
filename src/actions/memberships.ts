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
  role: z.enum(["ADMIN", "MANAGER", "EMPLOYEE"]),
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
  assertPermission(ctx.role, "employees", "full");
  assertPermission(ctx.role, "membership", "full");

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
  assertPermission(ctx.role, "membership", "full");

  await prisma.membership.deleteMany({ where: { employeeId, orgId: ctx.orgId } });

  revalidatePath(`/${orgSlug}/employees/${employeeId}`);
}

const updateSchema = z.object({
  role: z.enum(["ADMIN", "MANAGER", "EMPLOYEE"]),
  customRoleId: z.string().optional(),
});

export async function updateEmployeeAccess(
  orgSlug: string,
  employeeId: string,
  formData: FormData,
) {
  const ctx = await getOrgContext(orgSlug);
  assertPermission(ctx.role, "membership", "full");

  const parsed = updateSchema.safeParse({
    role: formData.get("role"),
    customRoleId: formData.get("customRoleId") || undefined,
  });
  if (!parsed.success) return;

  if (parsed.data.customRoleId) {
    const role = await prisma.customRole.findFirst({ where: { id: parsed.data.customRoleId, orgId: ctx.orgId } });
    if (!role) return;
  }

  await prisma.membership.updateMany({
    where: { employeeId, orgId: ctx.orgId },
    data: { role: parsed.data.role, customRoleId: parsed.data.customRoleId ?? null },
  });

  revalidatePath(`/${orgSlug}/employees/${employeeId}`);
}

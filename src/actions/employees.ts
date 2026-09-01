"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getOrgContext } from "@/lib/tenant";
import { assertPermission } from "@/lib/permissions";
import { employeeSchema } from "@/lib/validation/employee";
import { archiveOrDelete } from "@/lib/archive";

export interface ActionResult {
  error?: string;
}

const LOGIN_REGEX = /^[a-z0-9](?:[a-z0-9._-]{0,48}[a-z0-9])?$/;

/** Mirrors the grantSchema in actions/memberships.ts — kept local rather
 * than shared since the two call sites validate slightly different form
 * field names (`accessEmail` here vs `email` there, to avoid colliding with
 * the employee's own contact `email` field in the same <form>). */
const newAccessSchema = z.object({
  login: z.string().trim().toLowerCase().regex(LOGIN_REGEX, "Логин: латиница/цифры, без пробелов и @"),
  accessEmail: z.email("Некорректный email для входа"),
  password: z.string().trim().min(8, "Пароль: минимум 8 символов").max(200),
  role: z.enum(["ADMIN", "MANAGER", "EMPLOYEE", "PRODUCTION"]),
  customRoleId: z.string().optional(),
});

function parseEmployeeForm(formData: FormData) {
  return employeeSchema.safeParse({
    fullName: formData.get("fullName"),
    position: formData.get("position"),
    email: formData.get("email"),
    phone: formData.get("phone"),
    defaultStoreId: formData.get("defaultStoreId") || null,
    groupId: formData.get("groupId") || null,
  });
}

async function isValidStoreId(storeId: string | null | undefined, orgId: string): Promise<boolean> {
  if (!storeId) return true;
  const store = await prisma.store.findFirst({ where: { id: storeId, orgId } });
  return !!store;
}

async function isValidGroupId(groupId: string | null | undefined, orgId: string): Promise<boolean> {
  if (!groupId) return true;
  const group = await prisma.group.findFirst({ where: { id: groupId, orgId } });
  return !!group;
}

/**
 * Creates the Employee and — if the form's "Выдать доступ" checkbox was on
 * — grants system access in the SAME submit, so an admin doesn't have to
 * create the employee, land back on the list, reopen the card, and grant
 * access as a separate second step. Access-grant here always creates a
 * brand-new User (password required) — linking to an already-existing
 * platform User by email (the one edge case `grantEmployeeAccess` also
 * handles) still goes through the employee card after creation, same as
 * today; not worth the extra async-lookup UI for the one-shot creation form.
 */
export async function createEmployee(
  orgSlug: string,
  _prevState: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const ctx = await getOrgContext(orgSlug);
  assertPermission(ctx, "employees", "create");

  const parsed = parseEmployeeForm(formData);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Неверные данные" };
  }
  if (!(await isValidStoreId(parsed.data.defaultStoreId, ctx.orgId))) {
    return { error: "Склад не найден" };
  }
  if (!(await isValidGroupId(parsed.data.groupId, ctx.orgId))) {
    return { error: "Отдел не найден" };
  }

  const wantsAccess = formData.get("wantsAccess") === "1";
  let access: z.infer<typeof newAccessSchema> | null = null;
  if (wantsAccess) {
    assertPermission(ctx, "membership", "create");
    const accessParsed = newAccessSchema.safeParse({
      login: formData.get("login"),
      accessEmail: formData.get("accessEmail"),
      password: formData.get("password"),
      role: formData.get("role"),
      customRoleId: formData.get("customRoleId") || undefined,
    });
    if (!accessParsed.success) {
      return { error: accessParsed.error.issues[0]?.message ?? "Неверные данные доступа" };
    }
    access = accessParsed.data;

    if (access.customRoleId) {
      const role = await prisma.customRole.findFirst({ where: { id: access.customRoleId, orgId: ctx.orgId } });
      if (!role) return { error: "Роль не найдена" };
    }
    if (await prisma.user.findUnique({ where: { email: access.accessEmail } })) {
      return { error: "Этот email для входа уже используется другим аккаунтом" };
    }
  }

  const passwordHash = access ? await bcrypt.hash(access.password, 12) : null;

  let employeeId: string;
  try {
    employeeId = await prisma.$transaction(async (tx) => {
      const employee = await tx.employee.create({
        data: { ...parsed.data, orgId: ctx.orgId },
      });
      if (access) {
        const user = await tx.user.create({
          data: { name: employee.fullName, email: access.accessEmail, passwordHash: passwordHash! },
        });
        await tx.membership.create({
          data: {
            userId: user.id,
            orgId: ctx.orgId,
            role: access.role,
            login: access.login,
            employeeId: employee.id,
            customRoleId: access.customRoleId ?? null,
          },
        });
      }
      return employee.id;
    });
  } catch {
    return { error: wantsAccess ? "Такой логин уже занят в этой организации" : "Не удалось сохранить" };
  }

  revalidatePath(`/${orgSlug}/employees`);
  redirect(`/${orgSlug}/employees/${employeeId}`);
}

export async function updateEmployee(
  orgSlug: string,
  employeeId: string,
  _prevState: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const ctx = await getOrgContext(orgSlug);
  assertPermission(ctx, "employees", "edit");

  const parsed = parseEmployeeForm(formData);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Неверные данные" };
  }
  if (!(await isValidStoreId(parsed.data.defaultStoreId, ctx.orgId))) {
    return { error: "Склад не найден" };
  }
  if (!(await isValidGroupId(parsed.data.groupId, ctx.orgId))) {
    return { error: "Отдел не найден" };
  }

  await prisma.employee.update({
    where: { id: employeeId, orgId: ctx.orgId },
    data: parsed.data,
  });

  // Keep the employee's auto-generated vault access tag (Tag.kind ===
  // EMPLOYEE_ACCESS) in sync with their current name. Swallow a rare
  // unique-name collision (another tag already has this name) rather than
  // failing the whole profile update over a cosmetic tag label.
  try {
    await prisma.tag.updateMany({
      where: {
        orgId: ctx.orgId,
        kind: "EMPLOYEE_ACCESS",
        sourceEmployeeId: employeeId,
      },
      data: { name: parsed.data.fullName },
    });
  } catch {
    // ignore — see comment above
  }

  revalidatePath(`/${orgSlug}/employees`);
  redirect(`/${orgSlug}/employees`);
}

export async function archiveEmployee(orgSlug: string, employeeId: string) {
  const ctx = await getOrgContext(orgSlug);
  assertPermission(ctx, "employees", "edit");

  await prisma.employee.update({
    where: { id: employeeId, orgId: ctx.orgId },
    data: { status: "ARCHIVED", archivedAt: new Date() },
  });

  revalidatePath(`/${orgSlug}/employees`);
}

export async function restoreEmployee(orgSlug: string, employeeId: string) {
  const ctx = await getOrgContext(orgSlug);
  assertPermission(ctx, "employees", "edit");

  await prisma.employee.update({
    where: { id: employeeId, orgId: ctx.orgId },
    data: { status: "ACTIVE", archivedAt: null },
  });

  revalidatePath(`/${orgSlug}/employees`);
}

export async function deleteEmployee(orgSlug: string, employeeId: string) {
  const ctx = await getOrgContext(orgSlug);
  assertPermission(ctx, "employees", "delete");

  const result = await archiveOrDelete("employee", employeeId, ctx.orgId);

  revalidatePath(`/${orgSlug}/employees`);
  return result;
}

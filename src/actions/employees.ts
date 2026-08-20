"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getOrgContext } from "@/lib/tenant";
import { assertPermission } from "@/lib/permissions";
import { employeeSchema } from "@/lib/validation/employee";
import { archiveOrDelete } from "@/lib/archive";

export interface ActionResult {
  error?: string;
}

function parseEmployeeForm(formData: FormData) {
  return employeeSchema.safeParse({
    fullName: formData.get("fullName"),
    position: formData.get("position"),
    email: formData.get("email"),
    phone: formData.get("phone"),
  });
}

export async function createEmployee(
  orgSlug: string,
  _prevState: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const ctx = await getOrgContext(orgSlug);
  assertPermission(ctx.role, "employees", "edit");

  const parsed = parseEmployeeForm(formData);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Неверные данные" };
  }

  await prisma.employee.create({
    data: { ...parsed.data, orgId: ctx.orgId },
  });

  revalidatePath(`/${orgSlug}/employees`);
  redirect(`/${orgSlug}/employees`);
}

export async function updateEmployee(
  orgSlug: string,
  employeeId: string,
  _prevState: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const ctx = await getOrgContext(orgSlug);
  assertPermission(ctx.role, "employees", "edit");

  const parsed = parseEmployeeForm(formData);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Неверные данные" };
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
  assertPermission(ctx.role, "employees", "edit");

  await prisma.employee.update({
    where: { id: employeeId, orgId: ctx.orgId },
    data: { status: "ARCHIVED", archivedAt: new Date() },
  });

  revalidatePath(`/${orgSlug}/employees`);
}

export async function restoreEmployee(orgSlug: string, employeeId: string) {
  const ctx = await getOrgContext(orgSlug);
  assertPermission(ctx.role, "employees", "edit");

  await prisma.employee.update({
    where: { id: employeeId, orgId: ctx.orgId },
    data: { status: "ACTIVE", archivedAt: null },
  });

  revalidatePath(`/${orgSlug}/employees`);
}

export async function deleteEmployee(orgSlug: string, employeeId: string) {
  const ctx = await getOrgContext(orgSlug);
  assertPermission(ctx.role, "employees", "edit");

  const result = await archiveOrDelete("employee", employeeId, ctx.orgId);

  revalidatePath(`/${orgSlug}/employees`);
  return result;
}

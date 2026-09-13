"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getOrgContext } from "@/lib/tenant";
import { assertPermission } from "@/lib/permissions";
import { assertRowScope } from "@/lib/scope";
import { taskSchema } from "@/lib/validation/task";

export interface ActionResult {
  error?: string;
}

function parseForm(formData: FormData) {
  const assignedEmployeeId = formData.get("assignedEmployeeId");
  return taskSchema.safeParse({
    title: formData.get("title"),
    description: formData.get("description"),
    dueDate: formData.get("dueDate"),
    assignedEmployeeId: assignedEmployeeId === "__none__" ? "" : assignedEmployeeId,
  });
}

export async function createTask(orgSlug: string, _prevState: ActionResult, formData: FormData): Promise<ActionResult> {
  const ctx = await getOrgContext(orgSlug);
  assertPermission(ctx, "tasks", "create");
  // A task always has a creator on record — same expectation CashTransaction
  // already has for its own createdById (Restrict, required); an account
  // with no linked Employee (Block I2.4 self-service) can't create one.
  if (!ctx.employeeId) {
    return { error: "Для создания задач нужна привязка вашего аккаунта к сотруднику (профиль)" };
  }

  const parsed = parseForm(formData);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Неверные данные" };
  }

  if (parsed.data.assignedEmployeeId) {
    const assignee = await prisma.employee.findFirst({ where: { id: parsed.data.assignedEmployeeId, orgId: ctx.orgId } });
    if (!assignee) return { error: "Сотрудник не найден" };
  }

  await prisma.task.create({
    data: {
      orgId: ctx.orgId,
      title: parsed.data.title,
      description: parsed.data.description ?? null,
      dueDate: parsed.data.dueDate ? new Date(parsed.data.dueDate) : null,
      assignedEmployeeId: parsed.data.assignedEmployeeId ?? null,
      createdById: ctx.employeeId,
    },
  });

  revalidatePath(`/${orgSlug}/tasks`);
  redirect(`/${orgSlug}/tasks`);
}

export async function setTaskStatus(orgSlug: string, taskId: string, status: "OPEN" | "DONE"): Promise<ActionResult> {
  const ctx = await getOrgContext(orgSlug);
  assertPermission(ctx, "tasks", "edit");
  await assertRowScope(ctx, "tasks", taskId);

  await prisma.task.update({
    where: { id: taskId, orgId: ctx.orgId },
    data: { status, completedAt: status === "DONE" ? new Date() : null },
  });

  revalidatePath(`/${orgSlug}/tasks`);
  return {};
}

export async function deleteTask(orgSlug: string, taskId: string): Promise<ActionResult> {
  const ctx = await getOrgContext(orgSlug);
  assertPermission(ctx, "tasks", "delete");
  await assertRowScope(ctx, "tasks", taskId);

  await prisma.task.delete({ where: { id: taskId, orgId: ctx.orgId } });
  revalidatePath(`/${orgSlug}/tasks`);
  return {};
}

"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getOrgContext } from "@/lib/tenant";
import { assertPermission } from "@/lib/permissions";

export interface ActionResult {
  error?: string;
}

const roleSchema = z.enum(["ADMIN", "MANAGER", "EMPLOYEE", "PRODUCTION", "CASHIER"]);

export async function createStatusTransition(
  orgSlug: string,
  fromStatusId: string,
  toStatusId: string,
  allowedRoles: string[],
  allowedCustomRoleIds: string[] = [],
  allowedEmployeeIds: string[] = [],
): Promise<ActionResult> {
  const ctx = await getOrgContext(orgSlug);
  assertPermission(ctx, "documentStatuses", "create");

  if (!fromStatusId || !toStatusId) {
    return { error: "Выберите оба статуса" };
  }
  if (fromStatusId === toStatusId) {
    return { error: "Статус не может переходить сам в себя" };
  }

  const parsedRoles = roleSchema.array().safeParse(allowedRoles);
  if (!parsedRoles.success) {
    return { error: "Некорректные роли" };
  }

  const [fromStatus, toStatus, customRoleCount, employeeCount] = await Promise.all([
    prisma.documentStatus.findFirst({ where: { id: fromStatusId, orgId: ctx.orgId } }),
    prisma.documentStatus.findFirst({ where: { id: toStatusId, orgId: ctx.orgId } }),
    allowedCustomRoleIds.length > 0
      ? prisma.customRole.count({ where: { id: { in: allowedCustomRoleIds }, orgId: ctx.orgId } })
      : 0,
    allowedEmployeeIds.length > 0
      ? prisma.employee.count({ where: { id: { in: allowedEmployeeIds }, orgId: ctx.orgId } })
      : 0,
  ]);
  if (!fromStatus || !toStatus || fromStatus.kind !== toStatus.kind) {
    return { error: "Статус не найден" };
  }
  if (customRoleCount !== allowedCustomRoleIds.length || employeeCount !== allowedEmployeeIds.length) {
    return { error: "Роль или сотрудник не найдены" };
  }

  try {
    await prisma.documentStatusTransition.create({
      data: {
        fromStatusId,
        toStatusId,
        allowedRoles: parsedRoles.data,
        allowedCustomRoleIds,
        allowedEmployeeIds,
      },
    });
  } catch {
    return { error: "Такой переход уже добавлен" };
  }

  revalidatePath(`/${orgSlug}/settings/statuses`);
  return {};
}

export async function deleteStatusTransition(orgSlug: string, transitionId: string) {
  const ctx = await getOrgContext(orgSlug);
  assertPermission(ctx, "documentStatuses", "delete");

  const transition = await prisma.documentStatusTransition.findFirst({
    where: { id: transitionId, fromStatus: { orgId: ctx.orgId } },
  });
  if (!transition) return;

  await prisma.documentStatusTransition.delete({ where: { id: transitionId } });
  revalidatePath(`/${orgSlug}/settings/statuses`);
}

"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { getOrgContext } from "@/lib/tenant";
import { assertPermission } from "@/lib/permissions";

export interface ActionResult {
  error?: string;
}

export async function createExpenseItem(orgSlug: string, name: string): Promise<ActionResult> {
  const ctx = await getOrgContext(orgSlug);
  assertPermission(ctx, "expenseItems", "create");

  const trimmed = name.trim();
  if (!trimmed) return { error: "Введите название" };

  try {
    await prisma.expenseItem.create({ data: { orgId: ctx.orgId, name: trimmed } });
  } catch {
    return { error: "Такая статья расходов уже есть" };
  }

  revalidatePath(`/${orgSlug}/settings/expense-items`);
  return {};
}

export async function deleteExpenseItem(orgSlug: string, id: string): Promise<ActionResult> {
  const ctx = await getOrgContext(orgSlug);
  assertPermission(ctx, "expenseItems", "delete");

  await prisma.expenseItem.delete({ where: { id, orgId: ctx.orgId } });
  revalidatePath(`/${orgSlug}/settings/expense-items`);
  return {};
}

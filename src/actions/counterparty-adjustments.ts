"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { getOrgContext } from "@/lib/tenant";
import { assertPermission } from "@/lib/permissions";
import { assertRowScope } from "@/lib/scope";
import { counterpartyAdjustmentSchema } from "@/lib/validation/counterparty-adjustment";

export interface ActionResult {
  error?: string;
}

export async function createCounterpartyAdjustment(
  orgSlug: string,
  clientId: string,
  _prevState: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const ctx = await getOrgContext(orgSlug);
  assertPermission(ctx, "clients", "edit");
  await assertRowScope(ctx, "clients", clientId);
  if (!ctx.employeeId) {
    return { error: "Для корректировки баланса нужна привязка вашего аккаунта к сотруднику (профиль)" };
  }

  const parsed = counterpartyAdjustmentSchema.safeParse({
    side: formData.get("side"),
    amount: formData.get("amount"),
    comment: formData.get("comment"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Неверные данные" };
  }

  const client = await prisma.client.findFirst({ where: { id: clientId, orgId: ctx.orgId } });
  if (!client) return { error: "Клиент не найден" };

  await prisma.counterpartyAdjustment.create({
    data: {
      orgId: ctx.orgId,
      clientId,
      side: parsed.data.side,
      amount: parsed.data.amount,
      comment: parsed.data.comment ?? null,
      createdById: ctx.employeeId,
    },
  });

  revalidatePath(`/${orgSlug}/clients/${clientId}`);
  return {};
}

export async function deleteCounterpartyAdjustment(orgSlug: string, clientId: string, id: string): Promise<ActionResult> {
  const ctx = await getOrgContext(orgSlug);
  assertPermission(ctx, "clients", "edit");
  await assertRowScope(ctx, "clients", clientId);

  await prisma.counterpartyAdjustment.delete({ where: { id, orgId: ctx.orgId } });
  revalidatePath(`/${orgSlug}/clients/${clientId}`);
  return {};
}

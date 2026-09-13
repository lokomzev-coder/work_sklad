"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getOrgContext } from "@/lib/tenant";
import { assertPermission } from "@/lib/permissions";
import { cashOrderSchema } from "@/lib/validation/cash-order";
import { computeOrderPaymentStatus } from "@/lib/orders";

export interface ActionResult {
  error?: string;
}

export async function createCashOrder(
  orgSlug: string,
  _prevState: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const ctx = await getOrgContext(orgSlug);
  assertPermission(ctx, "payments", "create");
  if (!ctx.employeeId) {
    return { error: "Для кассовых ордеров нужна привязка вашего аккаунта к сотруднику (профиль)" };
  }

  // formData.get() returns null (not undefined) for a field with no
  // matching input in the DOM — the expenseItemId select only renders for
  // direction "OUT" (see CashOrderForm) — but Zod's .optional() only
  // tolerates undefined, so null must be normalized here first. "__none__"
  // is the Select's own "nothing selected" sentinel (base-ui can't submit a
  // real empty string as a native option value) — same convention as
  // Task's assignedEmployeeId.
  const expenseItemId = formData.get("expenseItemId");
  const parsed = cashOrderSchema.safeParse({
    direction: formData.get("direction") ?? undefined,
    amount: formData.get("amount") ?? undefined,
    counterpartyId: formData.get("counterpartyId") ?? undefined,
    expenseItemId: expenseItemId === "__none__" ? undefined : (expenseItemId ?? undefined),
    comment: formData.get("comment") ?? undefined,
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Неверные данные" };
  }

  if (parsed.data.counterpartyId) {
    const client = await prisma.client.findFirst({ where: { id: parsed.data.counterpartyId, orgId: ctx.orgId } });
    if (!client) return { error: "Контрагент не найден" };
  }
  if (parsed.data.expenseItemId) {
    const item = await prisma.expenseItem.findFirst({ where: { id: parsed.data.expenseItemId, orgId: ctx.orgId } });
    if (!item) return { error: "Статья расходов не найдена" };
  }

  await prisma.cashOrder.create({
    data: {
      orgId: ctx.orgId,
      direction: parsed.data.direction,
      amount: parsed.data.amount,
      counterpartyId: parsed.data.counterpartyId ?? null,
      expenseItemId: parsed.data.direction === "OUT" ? (parsed.data.expenseItemId ?? null) : null,
      comment: parsed.data.comment ?? null,
      createdById: ctx.employeeId,
    },
  });

  revalidatePath(`/${orgSlug}/payments/cash-orders`);
  redirect(`/${orgSlug}/payments/cash-orders`);
}

export interface CreateCashOrderFromOrderResult {
  error?: string;
}

/**
 * "Создать документ" → "Приходный ордер" (МойСклад model). Mirrors
 * `createPaymentFromOrder` (actions/payments.ts) exactly, just on the
 * CashOrder ledger instead of Payment — the acting employee's own record
 * is the cashier (`createdById`), same requirement `createCashOrder` above
 * already enforces. Counted by `computeOrderPaymentStatus` alongside
 * Payment when computing the order's remaining balance.
 */
export async function createCashOrderFromOrder(
  orgSlug: string,
  orderId: string,
): Promise<CreateCashOrderFromOrderResult> {
  const ctx = await getOrgContext(orgSlug);
  assertPermission(ctx, "payments", "create");
  if (!ctx.employeeId) {
    return { error: "Для кассовых ордеров нужна привязка вашего аккаунта к сотруднику (профиль)" };
  }

  const order = await prisma.order.findFirst({ where: { id: orderId, orgId: ctx.orgId } });
  if (!order) {
    return { error: "Заказ не найден" };
  }
  if (!order.clientId) {
    return { error: "У заказа не указан клиент — ордер не с кем связать" };
  }

  const status = await computeOrderPaymentStatus(orderId);
  const remaining = status.totalOrder - status.totalPaid;
  if (remaining <= 0) {
    return { error: "По заказу уже нет остатка к оплате" };
  }

  await prisma.cashOrder.create({
    data: {
      orgId: ctx.orgId,
      direction: "IN",
      amount: remaining,
      currency: status.currency,
      counterpartyId: order.clientId,
      orderId,
      createdById: ctx.employeeId,
    },
  });

  revalidatePath(`/${orgSlug}/payments/cash-orders`);
  revalidatePath(`/${orgSlug}/orders/${orderId}`);
  return {};
}

export async function deleteCashOrder(orgSlug: string, id: string): Promise<ActionResult> {
  const ctx = await getOrgContext(orgSlug);
  assertPermission(ctx, "payments", "delete");

  await prisma.cashOrder.delete({ where: { id, orgId: ctx.orgId } });
  revalidatePath(`/${orgSlug}/payments/cash-orders`);
  return {};
}

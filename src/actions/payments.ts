"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getOrgContext } from "@/lib/tenant";
import { assertPermission } from "@/lib/permissions";
import { paymentSchema } from "@/lib/validation/payment";
import { dispatchWebhookEvent } from "@/lib/webhooks";
import { getOrgBaseCurrency, getRateAt } from "@/lib/currency";
import { computeOrderPaymentStatus } from "@/lib/orders";

export interface ActionResult {
  error?: string;
}

export async function createPayment(
  orgSlug: string,
  _prevState: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const ctx = await getOrgContext(orgSlug);
  assertPermission(ctx, "payments", "create");

  const parsed = paymentSchema.safeParse({
    direction: formData.get("direction"),
    amount: formData.get("amount"),
    currency: formData.get("currency") || "RUB",
    counterpartyId: formData.get("counterpartyId"),
    comment: formData.get("comment"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Неверные данные" };
  }

  const counterparty = await prisma.client.findFirst({
    where: { id: parsed.data.counterpartyId, orgId: ctx.orgId },
  });
  if (!counterparty) {
    return { error: "Контрагент не найден" };
  }

  // Block M2: snapshot the rate at posting time so a later exchange-rate
  // change doesn't retroactively reprice this payment in reports.
  const baseCurrency = await getOrgBaseCurrency(ctx.orgId);
  const rateSnapshot =
    parsed.data.currency === baseCurrency
      ? null
      : await getRateAt(ctx.orgId, parsed.data.currency, new Date());

  const payment = await prisma.payment.create({
    data: { ...parsed.data, orgId: ctx.orgId, rateSnapshot },
  });
  dispatchWebhookEvent(ctx.orgId, "PAYMENT_CREATED", { paymentId: payment.id });

  revalidatePath(`/${orgSlug}/payments`);
  redirect(`/${orgSlug}/payments`);
}

export interface CreatePaymentFromOrderResult {
  error?: string;
}

/**
 * "Создать документ" → "Входящий платёж" (МойСклад model). Creates a
 * `Payment{direction: "IN"}` for the order's entire outstanding balance
 * (`computeOrderPaymentStatus`, already used for the order card's "Оплачено
 * X из Y" badge) — a one-click action like "Отгрузка"/"Счёт покупателю",
 * not an editable form (partial payments still go through the existing
 * `/payments/new` form). Doubles as "Предоплата" — МойСклад only enables
 * that as a separate button when online payment is configured (which this
 * project doesn't have); it's the same underlying document either way, so
 * a second, visually distinct menu item creating an identical Payment would
 * mislead rather than help. Payment has no document page of its own, so
 * this returns a result for a toast instead of redirecting.
 */
export async function createPaymentFromOrder(
  orgSlug: string,
  orderId: string,
): Promise<CreatePaymentFromOrderResult> {
  const ctx = await getOrgContext(orgSlug);
  assertPermission(ctx, "payments", "create");

  const order = await prisma.order.findFirst({ where: { id: orderId, orgId: ctx.orgId } });
  if (!order) {
    return { error: "Заказ не найден" };
  }
  if (!order.clientId) {
    return { error: "У заказа не указан клиент — платёж не с кем связать" };
  }

  const status = await computeOrderPaymentStatus(orderId);
  const remaining = status.totalOrder - status.totalPaid;
  if (remaining <= 0) {
    return { error: "По заказу уже нет остатка к оплате" };
  }

  const baseCurrency = await getOrgBaseCurrency(ctx.orgId);
  const rateSnapshot =
    status.currency === baseCurrency ? null : await getRateAt(ctx.orgId, status.currency, new Date());

  const payment = await prisma.payment.create({
    data: {
      orgId: ctx.orgId,
      direction: "IN",
      amount: remaining,
      currency: status.currency,
      rateSnapshot,
      counterpartyId: order.clientId,
      orderId,
    },
  });
  dispatchWebhookEvent(ctx.orgId, "PAYMENT_CREATED", { paymentId: payment.id });

  revalidatePath(`/${orgSlug}/payments`);
  revalidatePath(`/${orgSlug}/orders/${orderId}`);
  return {};
}

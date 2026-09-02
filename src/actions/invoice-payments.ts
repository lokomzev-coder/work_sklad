"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getOrgContext } from "@/lib/tenant";
import { assertPermission } from "@/lib/permissions";
import { getOrgBaseCurrency, getRateAt } from "@/lib/currency";
import { dispatchWebhookEvent } from "@/lib/webhooks";

const amountSchema = z.object({
  amount: z.coerce.number().positive("Сумма должна быть больше 0"),
  currency: z.string().trim().min(1).default("RUB"),
  comment: z.string().trim().max(500).optional(),
});

export interface RecordInvoicePaymentResult {
  error?: string;
}

/**
 * Block M5: the only place a Payment gets an invoiceOutId/invoiceInId —
 * called from the invoice's own detail page, not the generic /payments/new
 * form. Direction and counterparty are derived from the invoice itself
 * (OUT-invoice → incoming Payment; IN-invoice → outgoing Payment), so the
 * user only ever enters amount/currency/comment here.
 */
export async function recordInvoiceOutPayment(
  orgSlug: string,
  invoiceOutId: string,
  input: { amount: number; currency: string; comment?: string },
): Promise<RecordInvoicePaymentResult> {
  const ctx = await getOrgContext(orgSlug);
  assertPermission(ctx, "payments", "create");

  const parsed = amountSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Неверные данные" };
  }

  const invoiceOut = await prisma.invoiceOut.findFirst({
    where: { id: invoiceOutId, orgId: ctx.orgId },
    select: { clientId: true },
  });
  if (!invoiceOut) {
    return { error: "Счёт не найден" };
  }
  if (!invoiceOut.clientId) {
    return { error: "У счёта не указан клиент — платёж не к кому привязать" };
  }

  const baseCurrency = await getOrgBaseCurrency(ctx.orgId);
  const rateSnapshot =
    parsed.data.currency === baseCurrency ? null : await getRateAt(ctx.orgId, parsed.data.currency, new Date());

  const payment = await prisma.payment.create({
    data: {
      orgId: ctx.orgId,
      direction: "IN",
      amount: parsed.data.amount,
      currency: parsed.data.currency,
      rateSnapshot,
      counterpartyId: invoiceOut.clientId,
      invoiceOutId,
      comment: parsed.data.comment,
    },
  });
  dispatchWebhookEvent(ctx.orgId, "PAYMENT_CREATED", { paymentId: payment.id });

  revalidatePath(`/${orgSlug}/invoices-out/${invoiceOutId}`);
  return {};
}

export async function recordInvoiceInPayment(
  orgSlug: string,
  invoiceInId: string,
  input: { amount: number; currency: string; comment?: string },
): Promise<RecordInvoicePaymentResult> {
  const ctx = await getOrgContext(orgSlug);
  assertPermission(ctx, "payments", "create");

  const parsed = amountSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Неверные данные" };
  }

  const invoiceIn = await prisma.invoiceIn.findFirst({
    where: { id: invoiceInId, orgId: ctx.orgId },
    select: { supplierId: true },
  });
  if (!invoiceIn) {
    return { error: "Счёт не найден" };
  }
  if (!invoiceIn.supplierId) {
    return { error: "У счёта не указан поставщик — платёж не к кому привязать" };
  }

  const baseCurrency = await getOrgBaseCurrency(ctx.orgId);
  const rateSnapshot =
    parsed.data.currency === baseCurrency ? null : await getRateAt(ctx.orgId, parsed.data.currency, new Date());

  const payment = await prisma.payment.create({
    data: {
      orgId: ctx.orgId,
      direction: "OUT",
      amount: parsed.data.amount,
      currency: parsed.data.currency,
      rateSnapshot,
      counterpartyId: invoiceIn.supplierId,
      invoiceInId,
      comment: parsed.data.comment,
    },
  });
  dispatchWebhookEvent(ctx.orgId, "PAYMENT_CREATED", { paymentId: payment.id });

  revalidatePath(`/${orgSlug}/invoices-in/${invoiceInId}`);
  return {};
}

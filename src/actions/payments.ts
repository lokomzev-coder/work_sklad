"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getOrgContext } from "@/lib/tenant";
import { assertPermission } from "@/lib/permissions";
import { paymentSchema } from "@/lib/validation/payment";
import { dispatchWebhookEvent } from "@/lib/webhooks";
import { getOrgBaseCurrency, getRateAt } from "@/lib/currency";

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

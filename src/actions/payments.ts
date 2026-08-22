"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getOrgContext } from "@/lib/tenant";
import { assertPermission } from "@/lib/permissions";
import { paymentSchema } from "@/lib/validation/payment";

export interface ActionResult {
  error?: string;
}

export async function createPayment(
  orgSlug: string,
  _prevState: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const ctx = await getOrgContext(orgSlug);
  assertPermission(ctx.role, "orders", "edit");

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

  await prisma.payment.create({
    data: { ...parsed.data, orgId: ctx.orgId },
  });

  revalidatePath(`/${orgSlug}/payments`);
  redirect(`/${orgSlug}/payments`);
}

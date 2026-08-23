"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getOrgContext } from "@/lib/tenant";
import { assertPermission } from "@/lib/permissions";

export interface ActionResult {
  error?: string;
}

const rateSchema = z.object({
  currency: z.string().trim().toUpperCase().min(1, "Введите код валюты").max(10),
  rateToBase: z.coerce.number().positive("Курс должен быть больше 0"),
});

export async function setBaseCurrency(orgSlug: string, currency: string) {
  const ctx = await getOrgContext(orgSlug);
  assertPermission(ctx.role, "settings", "edit");

  const trimmed = currency.trim().toUpperCase();
  if (!trimmed) return;

  await prisma.organization.update({
    where: { id: ctx.orgId },
    data: { baseCurrency: trimmed },
  });

  revalidatePath(`/${orgSlug}/settings/currencies`);
}

export async function createExchangeRate(
  orgSlug: string,
  _prevState: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const ctx = await getOrgContext(orgSlug);
  assertPermission(ctx.role, "settings", "edit");

  const parsed = rateSchema.safeParse({
    currency: formData.get("currency"),
    rateToBase: formData.get("rateToBase"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Неверные данные" };
  }

  const org = await prisma.organization.findUniqueOrThrow({
    where: { id: ctx.orgId },
    select: { baseCurrency: true },
  });
  if (parsed.data.currency === org.baseCurrency) {
    return { error: "Это базовая валюта организации, курс для неё не нужен" };
  }

  await prisma.exchangeRate.create({
    data: { orgId: ctx.orgId, currency: parsed.data.currency, rateToBase: parsed.data.rateToBase },
  });

  revalidatePath(`/${orgSlug}/settings/currencies`);
  return {};
}

export async function deleteExchangeRate(orgSlug: string, rateId: string) {
  const ctx = await getOrgContext(orgSlug);
  assertPermission(ctx.role, "settings", "edit");

  await prisma.exchangeRate.delete({ where: { id: rateId, orgId: ctx.orgId } });

  revalidatePath(`/${orgSlug}/settings/currencies`);
}

"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getOrgContext } from "@/lib/tenant";
import { assertPermission } from "@/lib/permissions";
import { salesChannelSchema } from "@/lib/validation/sales-channel";

export interface ActionResult {
  error?: string;
}

function parseForm(formData: FormData) {
  return salesChannelSchema.safeParse({ name: formData.get("name") });
}

export async function createSalesChannel(
  orgSlug: string,
  _prevState: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const ctx = await getOrgContext(orgSlug);
  assertPermission(ctx, "salesChannels", "create");

  const parsed = parseForm(formData);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Неверные данные" };
  }

  try {
    await prisma.salesChannel.create({ data: { ...parsed.data, orgId: ctx.orgId } });
  } catch {
    return { error: "Такой канал продаж уже существует" };
  }

  revalidatePath(`/${orgSlug}/orders/channels`);
  redirect(`/${orgSlug}/orders/channels`);
}

export async function deleteSalesChannel(orgSlug: string, channelId: string) {
  const ctx = await getOrgContext(orgSlug);
  assertPermission(ctx, "salesChannels", "delete");

  const usageCount = await prisma.order.count({ where: { salesChannelId: channelId, orgId: ctx.orgId } });
  if (usageCount > 0) {
    return { error: `Нельзя удалить: используется в ${usageCount} заказ(ах)` };
  }

  await prisma.salesChannel.delete({ where: { id: channelId, orgId: ctx.orgId } });
  revalidatePath(`/${orgSlug}/orders/channels`);
  return {};
}

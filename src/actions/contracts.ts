"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getOrgContext } from "@/lib/tenant";
import { assertPermission } from "@/lib/permissions";
import { contractSchema } from "@/lib/validation/contract";

export interface ActionResult {
  error?: string;
}

function parseForm(formData: FormData) {
  return contractSchema.safeParse({
    number: formData.get("number"),
    clientId: formData.get("clientId"),
    signedAt: formData.get("signedAt"),
  });
}

export async function createContract(
  orgSlug: string,
  _prevState: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const ctx = await getOrgContext(orgSlug);
  assertPermission(ctx, "contracts", "create");

  const parsed = parseForm(formData);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Неверные данные" };
  }

  const client = await prisma.client.findFirst({
    where: { id: parsed.data.clientId, orgId: ctx.orgId },
  });
  if (!client) {
    return { error: "Контрагент не найден" };
  }

  await prisma.contract.create({
    data: {
      orgId: ctx.orgId,
      number: parsed.data.number,
      clientId: parsed.data.clientId,
      signedAt: parsed.data.signedAt ? new Date(parsed.data.signedAt) : undefined,
    },
  });

  revalidatePath(`/${orgSlug}/contracts`);
  redirect(`/${orgSlug}/contracts`);
}

export async function deleteContract(orgSlug: string, contractId: string) {
  const ctx = await getOrgContext(orgSlug);
  assertPermission(ctx, "contracts", "delete");

  const [orderCount, poCount] = await Promise.all([
    prisma.order.count({ where: { contractId, orgId: ctx.orgId } }),
    prisma.purchaseOrder.count({ where: { contractId, orgId: ctx.orgId } }),
  ]);
  if (orderCount > 0 || poCount > 0) {
    return {
      error: `Нельзя удалить: привязан к ${orderCount} заказ(ам) и ${poCount} заказ(ам) поставщику`,
    };
  }

  await prisma.contract.delete({ where: { id: contractId, orgId: ctx.orgId } });
  revalidatePath(`/${orgSlug}/contracts`);
  return {};
}

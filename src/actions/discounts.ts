"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { getOrgContext } from "@/lib/tenant";
import { assertPermission } from "@/lib/permissions";
import { discountSchema } from "@/lib/validation/discount";
import { assertDiscountTargetBelongsToOrg } from "@/lib/discount-target";

export interface ActionResult {
  error?: string;
}

export interface CreateDiscountInput {
  name: string;
  type: "PERCENTAGE" | "FIXED_AMOUNT";
  value: number;
  target: "ALL" | "CATALOG_GROUP" | "CATALOG_ITEM" | "CLIENT";
  targetId?: string | null;
  startDate?: string | null;
  endDate?: string | null;
  isActive?: boolean;
}

export async function createDiscount(orgSlug: string, input: CreateDiscountInput): Promise<ActionResult> {
  const ctx = await getOrgContext(orgSlug);
  assertPermission(ctx, "discounts", "create");

  const parsed = discountSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Неверные данные" };
  }

  const targetCheck = await assertDiscountTargetBelongsToOrg(ctx.orgId, parsed.data.target, parsed.data.targetId);
  if (!targetCheck.ok) {
    return { error: targetCheck.error };
  }

  await prisma.discount.create({
    data: {
      orgId: ctx.orgId,
      name: parsed.data.name,
      type: parsed.data.type,
      value: parsed.data.value,
      target: parsed.data.target,
      targetId: parsed.data.target === "ALL" ? null : (parsed.data.targetId ?? null),
      startDate: parsed.data.startDate ? new Date(parsed.data.startDate) : null,
      endDate: parsed.data.endDate ? new Date(parsed.data.endDate) : null,
      isActive: parsed.data.isActive,
    },
  });

  revalidatePath(`/${orgSlug}/settings/discounts`);
  return {};
}

export async function toggleDiscountActive(orgSlug: string, discountId: string, isActive: boolean): Promise<ActionResult> {
  const ctx = await getOrgContext(orgSlug);
  assertPermission(ctx, "discounts", "edit");

  await prisma.discount.update({ where: { id: discountId, orgId: ctx.orgId }, data: { isActive } });
  revalidatePath(`/${orgSlug}/settings/discounts`);
  return {};
}

export async function deleteDiscount(orgSlug: string, discountId: string): Promise<ActionResult> {
  const ctx = await getOrgContext(orgSlug);
  assertPermission(ctx, "discounts", "delete");

  await prisma.discount.delete({ where: { id: discountId, orgId: ctx.orgId } });
  revalidatePath(`/${orgSlug}/settings/discounts`);
  return {};
}

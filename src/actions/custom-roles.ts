"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getOrgContext } from "@/lib/tenant";
import { assertPermission } from "@/lib/permissions";
import type { CustomRolePermissions } from "@/lib/permissions";
import type { Prisma } from "@/generated/prisma/client";

export interface ActionResult {
  error?: string;
}

const createSchema = z.object({
  name: z.string().trim().min(1, "Введите название").max(60),
  ordersScope: z.enum(["ALL", "OWN"]),
});

export async function createCustomRole(
  orgSlug: string,
  _prevState: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const ctx = await getOrgContext(orgSlug);
  assertPermission(ctx.role, "settings", "edit");

  const parsed = createSchema.safeParse({
    name: formData.get("name"),
    ordersScope: formData.get("ordersScope"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Неверные данные" };
  }

  // One scope value governs both document kinds — a separate control for
  // "заказы поставщику" would double the UI for a distinction nobody has
  // asked to make independently; extend to two selects if that ever changes.
  const permissions: CustomRolePermissions = {
    orders: { scope: parsed.data.ordersScope },
    purchaseOrders: { scope: parsed.data.ordersScope },
  };

  try {
    await prisma.customRole.create({
      data: { orgId: ctx.orgId, name: parsed.data.name, permissions: permissions as unknown as Prisma.InputJsonValue },
    });
  } catch {
    return { error: "Роль с таким названием уже есть" };
  }

  revalidatePath(`/${orgSlug}/settings/roles`);
  return {};
}

export async function deleteCustomRole(orgSlug: string, roleId: string) {
  const ctx = await getOrgContext(orgSlug);
  assertPermission(ctx.role, "settings", "edit");

  await prisma.customRole.delete({ where: { id: roleId, orgId: ctx.orgId } });

  revalidatePath(`/${orgSlug}/settings/roles`);
}

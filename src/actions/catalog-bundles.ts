"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getOrgContext } from "@/lib/tenant";
import { assertPermission } from "@/lib/permissions";

const componentSchema = z.object({
  componentId: z.string().min(1),
  quantity: z.coerce.number().positive("Количество должно быть больше 0"),
});

const updateComponentsSchema = z.object({
  components: z.array(componentSchema),
});

export interface UpdateBundleComponentsInput {
  components: { componentId: string; quantity: number }[];
}

export interface UpdateBundleComponentsResult {
  error?: string;
}

export async function updateBundleComponents(
  orgSlug: string,
  bundleId: string,
  input: UpdateBundleComponentsInput,
): Promise<UpdateBundleComponentsResult> {
  const ctx = await getOrgContext(orgSlug);
  assertPermission(ctx.role, "catalog", "edit");

  const parsed = updateComponentsSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Неверные данные" };
  }

  const bundle = await prisma.catalogItem.findFirst({
    where: { id: bundleId, orgId: ctx.orgId },
  });
  if (!bundle || bundle.type !== "BUNDLE") {
    return { error: "Комплект не найден" };
  }

  const componentIds = [
    ...new Set(parsed.data.components.map((c) => c.componentId)),
  ];
  if (componentIds.includes(bundleId)) {
    return { error: "Комплект не может входить в самого себя" };
  }
  if (componentIds.length > 0) {
    const components = await prisma.catalogItem.findMany({
      where: { id: { in: componentIds }, orgId: ctx.orgId },
    });
    if (components.length !== componentIds.length) {
      return { error: "Один из товаров/услуг не найден" };
    }
    if (components.some((c) => c.type === "BUNDLE")) {
      return { error: "Комплект не может содержать другой комплект" };
    }
  }

  await prisma.$transaction([
    prisma.catalogItemComponent.deleteMany({ where: { bundleId } }),
    prisma.catalogItemComponent.createMany({
      data: parsed.data.components.map((c) => ({
        bundleId,
        componentId: c.componentId,
        quantity: c.quantity,
      })),
    }),
  ]);

  revalidatePath(`/${orgSlug}/catalog/${bundleId}`);
  return {};
}

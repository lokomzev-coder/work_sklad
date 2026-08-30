"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getOrgContext } from "@/lib/tenant";
import { assertPermission } from "@/lib/permissions";

const componentSchema = z.object({
  catalogItemId: z.string().min(1),
  quantity: z.coerce.number().positive("Количество должно быть больше 0"),
});

const upsertTechCardSchema = z.object({
  name: z.string().trim().min(1, "Введите название"),
  outputItemId: z.string().min(1, "Выберите выходной товар"),
  outputQuantity: z.coerce.number().positive("Количество должно быть больше 0"),
  components: z.array(componentSchema).min(1, "Добавьте хотя бы один материал"),
});

export interface UpsertTechCardInput {
  name: string;
  outputItemId: string;
  outputQuantity: number;
  components: { catalogItemId: string; quantity: number }[];
}

export interface UpsertTechCardResult {
  error?: string;
  techCardId?: string;
}

export async function upsertTechCard(
  orgSlug: string,
  techCardId: string | null,
  input: UpsertTechCardInput,
): Promise<UpsertTechCardResult> {
  const ctx = await getOrgContext(orgSlug);
  assertPermission(ctx.role, "production", "edit");

  const parsed = upsertTechCardSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Неверные данные" };
  }

  const componentIds = [...new Set(parsed.data.components.map((c) => c.catalogItemId))];
  if (componentIds.includes(parsed.data.outputItemId)) {
    return { error: "Выходной товар не может быть собственным материалом" };
  }

  const [outputItem, components] = await Promise.all([
    prisma.catalogItem.findFirst({
      where: { id: parsed.data.outputItemId, orgId: ctx.orgId },
    }),
    prisma.catalogItem.findMany({
      where: { id: { in: componentIds }, orgId: ctx.orgId },
    }),
  ]);
  if (!outputItem || outputItem.type !== "PRODUCT") {
    return { error: "Выходной товар должен быть складируемым товаром" };
  }
  if (components.length !== componentIds.length) {
    return { error: "Один из материалов не найден" };
  }
  if (components.some((c) => c.type !== "PRODUCT")) {
    return { error: "Материалом может быть только складируемый товар, не услуга/комплект" };
  }

  const componentsCreateData = parsed.data.components.map((c) => ({
    catalogItemId: c.catalogItemId,
    quantity: c.quantity,
  }));

  let techCardIdResult: string;

  if (techCardId) {
    await prisma.$transaction([
      prisma.techCardComponent.deleteMany({ where: { techCardId } }),
      prisma.techCard.update({
        where: { id: techCardId, orgId: ctx.orgId },
        data: {
          name: parsed.data.name,
          outputItemId: parsed.data.outputItemId,
          outputQuantity: parsed.data.outputQuantity,
          components: { create: componentsCreateData },
        },
      }),
    ]);
    techCardIdResult = techCardId;
  } else {
    const techCard = await prisma.techCard.create({
      data: {
        orgId: ctx.orgId,
        name: parsed.data.name,
        outputItemId: parsed.data.outputItemId,
        outputQuantity: parsed.data.outputQuantity,
        components: { create: componentsCreateData },
      },
    });
    techCardIdResult = techCard.id;
  }

  revalidatePath(`/${orgSlug}/production/tech-cards`);
  revalidatePath(`/${orgSlug}/production/tech-cards/${techCardIdResult}`);
  return { techCardId: techCardIdResult };
}

export async function archiveTechCard(orgSlug: string, techCardId: string) {
  const ctx = await getOrgContext(orgSlug);
  assertPermission(ctx.role, "production", "edit");

  await prisma.techCard.update({
    where: { id: techCardId, orgId: ctx.orgId },
    data: { status: "ARCHIVED", archivedAt: new Date() },
  });

  revalidatePath(`/${orgSlug}/production/tech-cards`);
}

export async function restoreTechCard(orgSlug: string, techCardId: string) {
  const ctx = await getOrgContext(orgSlug);
  assertPermission(ctx.role, "production", "edit");

  await prisma.techCard.update({
    where: { id: techCardId, orgId: ctx.orgId },
    data: { status: "ACTIVE", archivedAt: null },
  });

  revalidatePath(`/${orgSlug}/production/tech-cards`);
}

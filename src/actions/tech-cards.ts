"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getOrgContext } from "@/lib/tenant";
import { assertPermission } from "@/lib/permissions";

const componentSchema = z.object({
  catalogItemId: z.string().min(1),
  quantity: z.coerce.number().positive("Количество должно быть больше 0"),
  // Block F2: which stage (TechProcessPosition) this material is consumed
  // at, only meaningful when techProcessId is set. Null = defaults to the
  // first position (МойСклад's own rule), resolved in completeProductionStage.
  techProcessPositionId: z.string().min(1).nullable().optional(),
});

const upsertTechCardSchema = z.object({
  name: z.string().trim().min(1, "Введите название"),
  outputItemId: z.string().min(1, "Выберите выходной товар"),
  outputQuantity: z.coerce.number().positive("Количество должно быть больше 0"),
  laborCost: z.coerce.number().nonnegative("Стоимость труда не может быть отрицательной").nullable().optional(),
  techProcessId: z.string().min(1).nullable().optional(),
  components: z.array(componentSchema).min(1, "Добавьте хотя бы один материал"),
});

export interface UpsertTechCardInput {
  name: string;
  outputItemId: string;
  outputQuantity: number;
  laborCost?: number | null;
  techProcessId?: string | null;
  components: { catalogItemId: string; quantity: number; techProcessPositionId?: string | null }[];
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
  assertPermission(ctx, "techCards", techCardId ? "edit" : "create");

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

  let techProcessPositionIds: Set<string> | null = null;
  if (parsed.data.techProcessId) {
    const techProcess = await prisma.techProcess.findFirst({
      where: { id: parsed.data.techProcessId, orgId: ctx.orgId },
      include: { positions: true },
    });
    if (!techProcess) return { error: "Техпроцесс не найден" };
    techProcessPositionIds = new Set(techProcess.positions.map((p) => p.id));
  }
  for (const c of parsed.data.components) {
    if (c.techProcessPositionId && !techProcessPositionIds?.has(c.techProcessPositionId)) {
      return { error: "Этап материала не относится к выбранному техпроцессу" };
    }
  }

  const componentsCreateData = parsed.data.components.map((c) => ({
    catalogItemId: c.catalogItemId,
    quantity: c.quantity,
    // Only meaningful with a techProcess selected — silently dropped
    // otherwise so a leftover stage assignment can't survive removing the
    // techProcess from a tech card.
    techProcessPositionId: techProcessPositionIds ? (c.techProcessPositionId ?? null) : null,
  }));

  let techCardIdResult: string;

  if (techCardId) {
    // A ProductionOrder mid-partial-completion has already consumed
    // materials against this recipe's current shape — changing it under
    // that order would make its remaining increments (and its cost/print
    // history) inconsistent with what was already posted.
    const inProgressCount = await prisma.productionOrder.count({
      where: { techCardId, completedAt: null, completedQuantity: { gt: 0 } },
    });
    if (inProgressCount > 0) {
      return { error: "Нельзя менять состав техкарты, пока по ней есть задание в процессе частичного выполнения" };
    }

    await prisma.$transaction([
      prisma.techCardComponent.deleteMany({ where: { techCardId } }),
      prisma.techCard.update({
        where: { id: techCardId, orgId: ctx.orgId },
        data: {
          name: parsed.data.name,
          outputItemId: parsed.data.outputItemId,
          outputQuantity: parsed.data.outputQuantity,
          laborCost: parsed.data.laborCost ?? null,
          techProcessId: parsed.data.techProcessId ?? null,
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
        laborCost: parsed.data.laborCost ?? null,
        techProcessId: parsed.data.techProcessId ?? null,
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
  assertPermission(ctx, "techCards", "edit");

  await prisma.techCard.update({
    where: { id: techCardId, orgId: ctx.orgId },
    data: { status: "ARCHIVED", archivedAt: new Date() },
  });

  revalidatePath(`/${orgSlug}/production/tech-cards`);
}

export async function restoreTechCard(orgSlug: string, techCardId: string) {
  const ctx = await getOrgContext(orgSlug);
  assertPermission(ctx, "techCards", "edit");

  await prisma.techCard.update({
    where: { id: techCardId, orgId: ctx.orgId },
    data: { status: "ACTIVE", archivedAt: null },
  });

  revalidatePath(`/${orgSlug}/production/tech-cards`);
}

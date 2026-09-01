"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getOrgContext } from "@/lib/tenant";
import { assertPermission } from "@/lib/permissions";

const upsertTechProcessSchema = z.object({
  name: z.string().trim().min(1, "Введите название"),
  processingStageIds: z.array(z.string().min(1)).min(1, "Добавьте хотя бы один этап"),
});

export interface UpsertTechProcessInput {
  name: string;
  processingStageIds: string[];
}

export interface UpsertTechProcessResult {
  error?: string;
  techProcessId?: string;
}

export async function upsertTechProcess(
  orgSlug: string,
  techProcessId: string | null,
  input: UpsertTechProcessInput,
): Promise<UpsertTechProcessResult> {
  const ctx = await getOrgContext(orgSlug);
  assertPermission(ctx, "techProcesses", techProcessId ? "edit" : "create");

  const parsed = upsertTechProcessSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Неверные данные" };
  }

  const stageIds = [...new Set(parsed.data.processingStageIds)];
  const stages = await prisma.processingStage.findMany({
    where: { id: { in: stageIds }, orgId: ctx.orgId },
  });
  if (stages.length !== stageIds.length) {
    return { error: "Один из этапов не найден" };
  }

  const positionsCreateData = parsed.data.processingStageIds.map((processingStageId, position) => ({
    processingStageId,
    position,
  }));

  let techProcessIdResult: string;

  if (techProcessId) {
    // A ProductionOrder mid-stage-completion has already posted against this
    // process's current shape (positions -> ProductionStage rows created at
    // order creation time) — changing the position count/order under it
    // would desync stage progress from what was actually consumed. Mirrors
    // upsertTechCard's equivalent guard for Block F1.
    const inProgressCount = await prisma.productionOrder.count({
      where: {
        techCard: { techProcessId },
        completedAt: null,
        stages: { some: { completedQuantity: { gt: 0 } } },
      },
    });
    if (inProgressCount > 0) {
      return { error: "Нельзя менять состав техпроцесса, пока по нему есть задание в процессе выполнения" };
    }

    await prisma.$transaction([
      prisma.techProcessPosition.deleteMany({ where: { techProcessId } }),
      prisma.techProcess.update({
        where: { id: techProcessId, orgId: ctx.orgId },
        data: { name: parsed.data.name, positions: { create: positionsCreateData } },
      }),
    ]);
    techProcessIdResult = techProcessId;
  } else {
    const created = await prisma.techProcess.create({
      data: { orgId: ctx.orgId, name: parsed.data.name, positions: { create: positionsCreateData } },
    });
    techProcessIdResult = created.id;
  }

  revalidatePath(`/${orgSlug}/production/tech-processes`);
  revalidatePath(`/${orgSlug}/production/tech-processes/${techProcessIdResult}`);
  return { techProcessId: techProcessIdResult };
}

export async function archiveTechProcess(orgSlug: string, techProcessId: string) {
  const ctx = await getOrgContext(orgSlug);
  assertPermission(ctx, "techProcesses", "edit");

  await prisma.techProcess.update({
    where: { id: techProcessId, orgId: ctx.orgId },
    data: { status: "ARCHIVED", archivedAt: new Date() },
  });

  revalidatePath(`/${orgSlug}/production/tech-processes`);
}

export async function restoreTechProcess(orgSlug: string, techProcessId: string) {
  const ctx = await getOrgContext(orgSlug);
  assertPermission(ctx, "techProcesses", "edit");

  await prisma.techProcess.update({
    where: { id: techProcessId, orgId: ctx.orgId },
    data: { status: "ACTIVE", archivedAt: null },
  });

  revalidatePath(`/${orgSlug}/production/tech-processes`);
}

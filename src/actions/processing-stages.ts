"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getOrgContext } from "@/lib/tenant";
import { assertPermission } from "@/lib/permissions";

const upsertProcessingStageSchema = z.object({
  name: z.string().trim().min(1, "Введите название"),
  standardHourCost: z.coerce.number().nonnegative("Не может быть отрицательным").nullable().optional(),
});

export interface UpsertProcessingStageInput {
  name: string;
  standardHourCost?: number | null;
}

export interface UpsertProcessingStageResult {
  error?: string;
  processingStageId?: string;
}

export async function upsertProcessingStage(
  orgSlug: string,
  processingStageId: string | null,
  input: UpsertProcessingStageInput,
): Promise<UpsertProcessingStageResult> {
  const ctx = await getOrgContext(orgSlug);
  assertPermission(ctx, "techProcesses", processingStageId ? "edit" : "create");

  const parsed = upsertProcessingStageSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Неверные данные" };
  }

  const data = {
    name: parsed.data.name,
    standardHourCost: parsed.data.standardHourCost ?? null,
  };

  let processingStageIdResult: string;
  if (processingStageId) {
    const existing = await prisma.processingStage.findFirst({
      where: { id: processingStageId, orgId: ctx.orgId },
      select: { id: true },
    });
    if (!existing) return { error: "Этап не найден" };
    await prisma.processingStage.update({ where: { id: processingStageId }, data });
    processingStageIdResult = processingStageId;
  } else {
    const created = await prisma.processingStage.create({ data: { ...data, orgId: ctx.orgId } });
    processingStageIdResult = created.id;
  }

  revalidatePath(`/${orgSlug}/production/stages`);
  return { processingStageId: processingStageIdResult };
}

export async function archiveProcessingStage(orgSlug: string, processingStageId: string) {
  const ctx = await getOrgContext(orgSlug);
  assertPermission(ctx, "techProcesses", "edit");

  await prisma.processingStage.update({
    where: { id: processingStageId, orgId: ctx.orgId },
    data: { status: "ARCHIVED", archivedAt: new Date() },
  });

  revalidatePath(`/${orgSlug}/production/stages`);
}

export async function restoreProcessingStage(orgSlug: string, processingStageId: string) {
  const ctx = await getOrgContext(orgSlug);
  assertPermission(ctx, "techProcesses", "edit");

  await prisma.processingStage.update({
    where: { id: processingStageId, orgId: ctx.orgId },
    data: { status: "ACTIVE", archivedAt: null },
  });

  revalidatePath(`/${orgSlug}/production/stages`);
}

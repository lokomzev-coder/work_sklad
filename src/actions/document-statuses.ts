"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getOrgContext } from "@/lib/tenant";
import { assertPermission } from "@/lib/permissions";
import { listDocumentStatuses } from "@/lib/document-statuses";
import type { DocumentStatusKind } from "@/generated/prisma/enums";

export interface ActionResult {
  error?: string;
}

const createSchema = z.object({
  name: z.string().trim().min(1, "Введите название").max(60),
  color: z.string().trim().min(1).max(20),
});

export async function createDocumentStatus(
  orgSlug: string,
  kind: DocumentStatusKind,
  _prevState: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const ctx = await getOrgContext(orgSlug);
  assertPermission(ctx, "documentStatuses", "create");

  const parsed = createSchema.safeParse({
    name: formData.get("name"),
    color: formData.get("color"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Неверные данные" };
  }

  const existing = await listDocumentStatuses(ctx.orgId, kind);
  const duplicate = existing.some((s) => s.name === parsed.data.name);
  if (duplicate) {
    return { error: "Статус с таким названием уже есть" };
  }

  await prisma.documentStatus.create({
    data: {
      orgId: ctx.orgId,
      kind,
      name: parsed.data.name,
      color: parsed.data.color,
      position: existing.length,
    },
  });

  revalidatePath(`/${orgSlug}/settings/statuses`);
  return {};
}

export async function renameDocumentStatus(orgSlug: string, statusId: string, name: string) {
  const ctx = await getOrgContext(orgSlug);
  assertPermission(ctx, "documentStatuses", "edit");

  const trimmed = name.trim();
  if (!trimmed) return { error: "Введите название" };

  await prisma.documentStatus.update({
    where: { id: statusId, orgId: ctx.orgId },
    data: { name: trimmed },
  });

  revalidatePath(`/${orgSlug}/settings/statuses`);
  return {};
}

export async function toggleFinalStatus(orgSlug: string, statusId: string, isFinal: boolean) {
  const ctx = await getOrgContext(orgSlug);
  assertPermission(ctx, "documentStatuses", "edit");

  await prisma.documentStatus.update({
    where: { id: statusId, orgId: ctx.orgId },
    data: { isFinal },
  });

  revalidatePath(`/${orgSlug}/settings/statuses`);
}

export async function moveDocumentStatus(orgSlug: string, statusId: string, direction: "up" | "down") {
  const ctx = await getOrgContext(orgSlug);
  assertPermission(ctx, "documentStatuses", "edit");

  const status = await prisma.documentStatus.findFirst({
    where: { id: statusId, orgId: ctx.orgId },
  });
  if (!status) return;

  const neighbor = await prisma.documentStatus.findFirst({
    where: {
      orgId: ctx.orgId,
      kind: status.kind,
      position: direction === "up" ? { lt: status.position } : { gt: status.position },
    },
    orderBy: { position: direction === "up" ? "desc" : "asc" },
  });
  if (!neighbor) return;

  await prisma.$transaction([
    prisma.documentStatus.update({ where: { id: status.id }, data: { position: neighbor.position } }),
    prisma.documentStatus.update({ where: { id: neighbor.id }, data: { position: status.position } }),
  ]);

  revalidatePath(`/${orgSlug}/settings/statuses`);
}

export interface DeleteStatusResult {
  error?: string;
}

export async function deleteDocumentStatus(orgSlug: string, statusId: string): Promise<DeleteStatusResult> {
  const ctx = await getOrgContext(orgSlug);
  assertPermission(ctx, "documentStatuses", "delete");

  const status = await prisma.documentStatus.findFirst({ where: { id: statusId, orgId: ctx.orgId } });
  if (!status) return { error: "Статус не найден" };

  const [orderCount, poCount, siblingCount] = await Promise.all([
    prisma.order.count({ where: { statusId } }),
    prisma.purchaseOrder.count({ where: { statusId } }),
    prisma.documentStatus.count({ where: { orgId: ctx.orgId, kind: status.kind } }),
  ]);
  if (orderCount + poCount > 0) {
    return { error: `Нельзя удалить: используется в ${orderCount + poCount} документ(ах)` };
  }
  if (siblingCount <= 1) {
    return { error: "Нельзя удалить последний статус" };
  }

  await prisma.documentStatus.delete({ where: { id: statusId } });
  revalidatePath(`/${orgSlug}/settings/statuses`);
  return {};
}

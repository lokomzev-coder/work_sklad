"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { getOrgContext } from "@/lib/tenant";
import { assertPermission } from "@/lib/permissions";
import type { Resource } from "@/lib/permissions";

export interface ActionResult {
  error?: string;
}

/** МойСклад's eventfeed (comment thread) is generic across document types,
 * but this project has no separate "eventFeed" permission — posting/viewing
 * a comment requires the same permission as the underlying document itself,
 * so a user can't comment on a document they couldn't otherwise open. */
const ENTITY_TYPE_TO_RESOURCE: Record<string, Resource> = {
  Order: "orders",
  PurchaseOrder: "purchaseOrders",
  InvoiceOut: "invoicesOut",
  InvoiceIn: "invoicesIn",
  StockMovement: "warehouse",
  Payment: "payments",
  ProductionOrder: "productionOrders",
};

function resourceFor(entityType: string): Resource {
  const resource = ENTITY_TYPE_TO_RESOURCE[entityType];
  if (!resource) throw new Error(`Комментарии недоступны для типа "${entityType}"`);
  return resource;
}

export async function createComment(
  orgSlug: string,
  entityType: string,
  entityId: string,
  text: string,
  revalidateHref: string,
): Promise<ActionResult> {
  const ctx = await getOrgContext(orgSlug);
  assertPermission(ctx, resourceFor(entityType), "view");
  if (!ctx.employeeId) {
    return { error: "Для комментариев нужна привязка вашего аккаунта к сотруднику (профиль)" };
  }

  const trimmed = text.trim();
  if (!trimmed) return { error: "Введите текст комментария" };

  await prisma.comment.create({
    data: { orgId: ctx.orgId, entityType, entityId, authorId: ctx.employeeId, text: trimmed },
  });

  revalidatePath(revalidateHref);
  return {};
}

export async function deleteComment(orgSlug: string, commentId: string, revalidateHref: string): Promise<ActionResult> {
  const ctx = await getOrgContext(orgSlug);

  const comment = await prisma.comment.findFirst({ where: { id: commentId, orgId: ctx.orgId } });
  if (!comment) return { error: "Комментарий не найден" };
  assertPermission(ctx, resourceFor(comment.entityType), "view");
  // Only the author can delete their own comment — no separate "moderate
  // others' comments" concept in this simplified version.
  if (comment.authorId !== ctx.employeeId) {
    return { error: "Можно удалить только свой комментарий" };
  }

  await prisma.comment.delete({ where: { id: commentId } });
  revalidatePath(revalidateHref);
  return {};
}

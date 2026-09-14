"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { getOrgContext } from "@/lib/tenant";
import { assertPermission } from "@/lib/permissions";
import type { Resource } from "@/lib/permissions";
import { saveUploadedFile, deleteStoredFile, MAX_UPLOAD_SIZE } from "@/lib/file-storage";

export interface ActionResult {
  error?: string;
}

/** Same idea as comments.ts's own map — uploading/viewing a file on a
 * document requires the same permission as the document itself, no separate
 * "attachments" resource. CatalogItem images are the one entityType outside
 * the document set (Block O phase 8's other half of this same feature). */
const ENTITY_TYPE_TO_RESOURCE: Record<string, Resource> = {
  CatalogItem: "catalog",
  Order: "orders",
  PurchaseOrder: "purchaseOrders",
  InvoiceOut: "invoicesOut",
  InvoiceIn: "invoicesIn",
  StockMovement: "warehouse",
  ProductionOrder: "productionOrders",
};

function resourceFor(entityType: string): Resource {
  const resource = ENTITY_TYPE_TO_RESOURCE[entityType];
  if (!resource) throw new Error(`Вложения недоступны для типа "${entityType}"`);
  return resource;
}

export async function uploadAttachment(
  orgSlug: string,
  entityType: string,
  entityId: string,
  revalidateHref: string,
  formData: FormData,
): Promise<ActionResult> {
  const ctx = await getOrgContext(orgSlug);
  assertPermission(ctx, resourceFor(entityType), "edit");
  if (!ctx.employeeId) {
    return { error: "Для загрузки файлов нужна привязка вашего аккаунта к сотруднику (профиль)" };
  }

  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return { error: "Файл не выбран" };
  }
  if (file.size > MAX_UPLOAD_SIZE) {
    return { error: "Файл больше 10MB" };
  }

  let position = 0;
  if (entityType === "CatalogItem") {
    position = await prisma.attachment.count({ where: { orgId: ctx.orgId, entityType, entityId } });
  }

  let saved;
  try {
    saved = await saveUploadedFile(ctx.orgId, file);
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Не удалось сохранить файл" };
  }
  await prisma.attachment.create({
    data: {
      orgId: ctx.orgId,
      entityType,
      entityId,
      fileName: saved.fileName,
      mimeType: saved.mimeType,
      sizeBytes: saved.sizeBytes,
      storagePath: saved.storagePath,
      position,
      createdById: ctx.employeeId,
    },
  });

  revalidatePath(revalidateHref);
  return {};
}

export async function deleteAttachment(orgSlug: string, id: string, revalidateHref: string): Promise<ActionResult> {
  const ctx = await getOrgContext(orgSlug);

  const attachment = await prisma.attachment.findFirst({ where: { id, orgId: ctx.orgId } });
  if (!attachment) return { error: "Файл не найден" };
  assertPermission(ctx, resourceFor(attachment.entityType), "edit");

  await prisma.attachment.delete({ where: { id } });
  await deleteStoredFile(attachment.storagePath);

  revalidatePath(revalidateHref);
  return {};
}

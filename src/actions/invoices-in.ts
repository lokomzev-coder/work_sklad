"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getOrgContext } from "@/lib/tenant";
import { assertPermission } from "@/lib/permissions";
import { getDefaultStatusId, getAllowedNextStatusIds } from "@/lib/document-statuses";
import { dispatchWebhookEvent } from "@/lib/webhooks";
import { saveCustomFieldValuesRecord } from "@/lib/custom-fields";

const lineItemSchema = z.object({
  catalogItemId: z.string().min(1),
  quantity: z.coerce.number().positive("Количество должно быть больше 0"),
  unitCost: z.coerce.number().min(0, "Цена не может быть отрицательной"),
});

const upsertInvoiceInSchema = z.object({
  supplierId: z.string().min(1).nullable(),
  contractId: z.string().min(1).nullable().optional(),
  legalEntityId: z.string().min(1).nullable().optional(),
  lineItems: z.array(lineItemSchema).min(1, "Добавьте хотя бы одну позицию"),
});

export interface UpsertInvoiceInInput {
  supplierId: string | null;
  contractId?: string | null;
  legalEntityId?: string | null;
  lineItems: { catalogItemId: string; quantity: number; unitCost: number }[];
  customFieldValues?: Record<string, string>;
}

export interface UpsertInvoiceInResult {
  error?: string;
  invoiceInId?: string;
}

async function nextInvoiceInNumber(orgId: string): Promise<number> {
  const last = await prisma.invoiceIn.findFirst({
    where: { orgId },
    orderBy: { number: "desc" },
    select: { number: true },
  });
  return (last?.number ?? 0) + 1;
}

export async function upsertInvoiceIn(
  orgSlug: string,
  invoiceInId: string | null,
  input: UpsertInvoiceInInput,
): Promise<UpsertInvoiceInResult> {
  const ctx = await getOrgContext(orgSlug);
  assertPermission(ctx, "invoicesIn", invoiceInId ? "edit" : "create");

  const parsed = upsertInvoiceInSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Неверные данные" };
  }

  const catalogItemIds = [...new Set(parsed.data.lineItems.map((li) => li.catalogItemId))];
  const catalogItems = await prisma.catalogItem.findMany({
    where: { id: { in: catalogItemIds }, orgId: ctx.orgId },
  });
  if (catalogItems.length !== catalogItemIds.length) {
    return { error: "Один из товаров/услуг не найден" };
  }
  const currencyById = new Map(catalogItems.map((c) => [c.id, c.currency]));

  if (parsed.data.contractId) {
    const contract = await prisma.contract.findFirst({
      where: { id: parsed.data.contractId, orgId: ctx.orgId },
    });
    if (!contract) {
      return { error: "Договор не найден" };
    }
  }
  if (parsed.data.legalEntityId) {
    const legalEntity = await prisma.legalEntity.findFirst({
      where: { id: parsed.data.legalEntityId, orgId: ctx.orgId },
    });
    if (!legalEntity) {
      return { error: "Юрлицо не найдено" };
    }
  }

  const lineItemsCreateData = parsed.data.lineItems.map((li) => ({
    catalogItemId: li.catalogItemId,
    quantity: li.quantity,
    unitPriceSnapshot: li.unitCost,
    currency: currencyById.get(li.catalogItemId)!,
  }));

  let invoiceInIdResult: string;
  let isNew = false;

  if (invoiceInId) {
    await prisma.$transaction([
      prisma.invoiceInLineItem.deleteMany({ where: { invoiceInId } }),
      prisma.invoiceIn.update({
        where: { id: invoiceInId, orgId: ctx.orgId },
        data: {
          supplierId: parsed.data.supplierId,
          contractId: parsed.data.contractId ?? null,
          legalEntityId: parsed.data.legalEntityId ?? null,
          lineItems: { create: lineItemsCreateData },
        },
      }),
    ]);
    invoiceInIdResult = invoiceInId;
  } else {
    const [number, statusId] = await Promise.all([
      nextInvoiceInNumber(ctx.orgId),
      getDefaultStatusId(ctx.orgId, "INVOICE_IN"),
    ]);
    const invoiceIn = await prisma.invoiceIn.create({
      data: {
        orgId: ctx.orgId,
        number,
        statusId,
        supplierId: parsed.data.supplierId,
        contractId: parsed.data.contractId ?? null,
        legalEntityId: parsed.data.legalEntityId ?? null,
        lineItems: { create: lineItemsCreateData },
      },
    });
    invoiceInIdResult = invoiceIn.id;
    isNew = true;
  }

  if (input.customFieldValues) {
    await saveCustomFieldValuesRecord(ctx.orgId, "INVOICE_IN", invoiceInIdResult, input.customFieldValues);
  }

  revalidatePath(`/${orgSlug}/invoices-in`);
  revalidatePath(`/${orgSlug}/invoices-in/${invoiceInIdResult}`);
  if (isNew) {
    dispatchWebhookEvent(ctx.orgId, "INVOICE_IN_CREATED", { invoiceInId: invoiceInIdResult });
  }
  return { invoiceInId: invoiceInIdResult };
}

export async function updateInvoiceInStatus(orgSlug: string, invoiceInId: string, statusId: string) {
  const ctx = await getOrgContext(orgSlug);
  assertPermission(ctx, "invoicesIn", "edit");

  const invoiceIn = await prisma.invoiceIn.findFirst({
    where: { id: invoiceInId, orgId: ctx.orgId },
    select: { statusId: true },
  });
  if (!invoiceIn) {
    throw new Error("Счёт не найден");
  }

  const status = await prisma.documentStatus.findFirst({
    where: { id: statusId, orgId: ctx.orgId, kind: "INVOICE_IN" },
  });
  if (!status) {
    throw new Error("Статус не найден");
  }

  if (statusId !== invoiceIn.statusId) {
    const allowed = await getAllowedNextStatusIds(ctx.orgId, "INVOICE_IN", invoiceIn.statusId, {
      role: ctx.role,
      customRoleId: ctx.customRoleId,
      employeeId: ctx.employeeId,
    });
    if (!allowed.has(statusId)) {
      throw new Error("Такой переход между статусами запрещён");
    }
  }

  await prisma.invoiceIn.update({
    where: { id: invoiceInId, orgId: ctx.orgId },
    data: { statusId },
  });

  revalidatePath(`/${orgSlug}/invoices-in`);
  revalidatePath(`/${orgSlug}/invoices-in/${invoiceInId}`);
  dispatchWebhookEvent(ctx.orgId, "INVOICE_IN_STATUS_CHANGED", { invoiceInId, statusId });
}

/** Block M5: mirror of createInvoiceFromOrder — see its comment. */
export async function createInvoiceFromPurchaseOrder(orgSlug: string, purchaseOrderId: string): Promise<void> {
  const ctx = await getOrgContext(orgSlug);
  assertPermission(ctx, "invoicesIn", "create");

  const purchaseOrder = await prisma.purchaseOrder.findFirst({
    where: { id: purchaseOrderId, orgId: ctx.orgId },
    include: { lineItems: true },
  });
  if (!purchaseOrder) {
    throw new Error("Заказ поставщику не найден");
  }

  const [number, statusId] = await Promise.all([
    nextInvoiceInNumber(ctx.orgId),
    getDefaultStatusId(ctx.orgId, "INVOICE_IN"),
  ]);

  const invoiceIn = await prisma.invoiceIn.create({
    data: {
      orgId: ctx.orgId,
      number,
      statusId,
      supplierId: purchaseOrder.supplierId,
      contractId: purchaseOrder.contractId,
      legalEntityId: purchaseOrder.legalEntityId,
      purchaseOrderId: purchaseOrder.id,
      lineItems: {
        create: purchaseOrder.lineItems.map((li) => ({
          catalogItemId: li.catalogItemId,
          quantity: li.quantity,
          unitPriceSnapshot: li.unitPriceSnapshot,
          currency: li.currency,
        })),
      },
    },
  });

  revalidatePath(`/${orgSlug}/invoices-in`);
  dispatchWebhookEvent(ctx.orgId, "INVOICE_IN_CREATED", { invoiceInId: invoiceIn.id });
  redirect(`/${orgSlug}/invoices-in/${invoiceIn.id}`);
}

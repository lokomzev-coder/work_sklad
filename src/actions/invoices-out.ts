"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getOrgContext } from "@/lib/tenant";
import { assertPermission } from "@/lib/permissions";
import { getDefaultStatusId, getAllowedNextStatusIds } from "@/lib/document-statuses";
import { notifyDocumentEvent } from "@/lib/scenarios";
import { saveCustomFieldValuesRecord } from "@/lib/custom-fields";

const lineItemSchema = z.object({
  catalogItemId: z.string().min(1),
  variantId: z.string().min(1).nullable().optional(),
  quantity: z.coerce.number().positive("Количество должно быть больше 0"),
});

const upsertInvoiceOutSchema = z.object({
  clientId: z.string().min(1).nullable(),
  contractId: z.string().min(1).nullable().optional(),
  legalEntityId: z.string().min(1).nullable().optional(),
  lineItems: z.array(lineItemSchema).min(1, "Добавьте хотя бы одну позицию"),
});

export interface UpsertInvoiceOutInput {
  clientId: string | null;
  contractId?: string | null;
  legalEntityId?: string | null;
  lineItems: { catalogItemId: string; variantId?: string | null; quantity: number }[];
  customFieldValues?: Record<string, string>;
}

export interface UpsertInvoiceOutResult {
  error?: string;
  invoiceOutId?: string;
}

async function nextInvoiceOutNumber(orgId: string): Promise<number> {
  const last = await prisma.invoiceOut.findFirst({
    where: { orgId },
    orderBy: { number: "desc" },
    select: { number: true },
  });
  return (last?.number ?? 0) + 1;
}

export async function upsertInvoiceOut(
  orgSlug: string,
  invoiceOutId: string | null,
  input: UpsertInvoiceOutInput,
): Promise<UpsertInvoiceOutResult> {
  const ctx = await getOrgContext(orgSlug);
  assertPermission(ctx, "invoicesOut", invoiceOutId ? "edit" : "create");

  const parsed = upsertInvoiceOutSchema.safeParse(input);
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
  const priceById = new Map(catalogItems.map((c) => [c.id, c.unitPrice]));
  const currencyById = new Map(catalogItems.map((c) => [c.id, c.currency]));

  const variantIds = [
    ...new Set(parsed.data.lineItems.map((li) => li.variantId).filter((v): v is string => !!v)),
  ];
  const variants = variantIds.length
    ? await prisma.catalogItemVariant.findMany({ where: { id: { in: variantIds } } })
    : [];
  const variantById = new Map(variants.map((v) => [v.id, v]));
  for (const li of parsed.data.lineItems) {
    if (li.variantId) {
      const variant = variantById.get(li.variantId);
      if (!variant || variant.catalogItemId !== li.catalogItemId) {
        return { error: "Модификация не найдена" };
      }
    }
  }

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

  const lineItemsCreateData = parsed.data.lineItems.map((li) => {
    const variant = li.variantId ? variantById.get(li.variantId) : undefined;
    return {
      catalogItemId: li.catalogItemId,
      variantId: li.variantId ?? undefined,
      quantity: li.quantity,
      // Snapshotted at invoice time — later catalog price edits don't
      // retroactively change an already-issued invoice.
      unitPriceSnapshot: variant?.priceOverride ?? priceById.get(li.catalogItemId)!,
      currency: currencyById.get(li.catalogItemId)!,
    };
  });

  let invoiceOutIdResult: string;
  let isNew = false;

  if (invoiceOutId) {
    await prisma.$transaction([
      prisma.invoiceOutLineItem.deleteMany({ where: { invoiceOutId } }),
      prisma.invoiceOut.update({
        where: { id: invoiceOutId, orgId: ctx.orgId },
        data: {
          clientId: parsed.data.clientId,
          contractId: parsed.data.contractId ?? null,
          legalEntityId: parsed.data.legalEntityId ?? null,
          lineItems: { create: lineItemsCreateData },
        },
      }),
    ]);
    invoiceOutIdResult = invoiceOutId;
  } else {
    const [number, statusId] = await Promise.all([
      nextInvoiceOutNumber(ctx.orgId),
      getDefaultStatusId(ctx.orgId, "INVOICE_OUT"),
    ]);
    const invoiceOut = await prisma.invoiceOut.create({
      data: {
        orgId: ctx.orgId,
        number,
        statusId,
        clientId: parsed.data.clientId,
        contractId: parsed.data.contractId ?? null,
        legalEntityId: parsed.data.legalEntityId ?? null,
        lineItems: { create: lineItemsCreateData },
      },
    });
    invoiceOutIdResult = invoiceOut.id;
    isNew = true;
  }

  if (input.customFieldValues) {
    await saveCustomFieldValuesRecord(ctx.orgId, "INVOICE_OUT", invoiceOutIdResult, input.customFieldValues);
  }

  revalidatePath(`/${orgSlug}/invoices-out`);
  revalidatePath(`/${orgSlug}/invoices-out/${invoiceOutIdResult}`);
  if (isNew) {
    await notifyDocumentEvent(
      ctx.orgId, "INVOICE_OUT_CREATED", { invoiceOutId: invoiceOutIdResult }, "INVOICE_OUT", "CREATED", invoiceOutIdResult,
    );
  }
  return { invoiceOutId: invoiceOutIdResult };
}

export async function updateInvoiceOutStatus(orgSlug: string, invoiceOutId: string, statusId: string) {
  const ctx = await getOrgContext(orgSlug);
  assertPermission(ctx, "invoicesOut", "edit");

  const invoiceOut = await prisma.invoiceOut.findFirst({
    where: { id: invoiceOutId, orgId: ctx.orgId },
    select: { statusId: true },
  });
  if (!invoiceOut) {
    throw new Error("Счёт не найден");
  }

  const status = await prisma.documentStatus.findFirst({
    where: { id: statusId, orgId: ctx.orgId, kind: "INVOICE_OUT" },
  });
  if (!status) {
    throw new Error("Статус не найден");
  }

  if (statusId !== invoiceOut.statusId) {
    const allowed = await getAllowedNextStatusIds(ctx.orgId, "INVOICE_OUT", invoiceOut.statusId, {
      role: ctx.role,
      customRoleId: ctx.customRoleId,
      employeeId: ctx.employeeId,
    });
    if (!allowed.has(statusId)) {
      throw new Error("Такой переход между статусами запрещён");
    }
  }

  await prisma.invoiceOut.update({
    where: { id: invoiceOutId, orgId: ctx.orgId },
    data: { statusId },
  });

  revalidatePath(`/${orgSlug}/invoices-out`);
  revalidatePath(`/${orgSlug}/invoices-out/${invoiceOutId}`);
  await notifyDocumentEvent(
    ctx.orgId, "INVOICE_OUT_STATUS_CHANGED", { invoiceOutId, statusId }, "INVOICE_OUT", "STATUS_CHANGED", invoiceOutId,
  );
}

/**
 * Block M5: core creation logic, no redirect/permission-check/revalidate —
 * reused by both createInvoiceFromOrder (manual "Создать счёт" button
 * below) and Block K's executeCreateRelatedDocument (a scenario's
 * CREATE_RELATED_DOCUMENT action), which drives its own error handling
 * instead of these UI-facing side effects. Same extraction pattern as
 * catalog-variants.ts::createCatalogVariantRecord (Block M6/J).
 *
 * Copies a fresh snapshot of the order's own line items (its
 * unitPriceSnapshot/currency, not the catalog's current price) — orderId is
 * provenance only, never re-synced if the order changes after this call.
 */
export async function createInvoiceOutFromOrderRecord(
  orgId: string,
  orderId: string,
): Promise<{ invoiceOutId: string } | { error: string }> {
  const order = await prisma.order.findFirst({
    where: { id: orderId, orgId },
    include: { lineItems: true },
  });
  if (!order) {
    return { error: "Заказ не найден" };
  }

  const [number, statusId] = await Promise.all([
    nextInvoiceOutNumber(orgId),
    getDefaultStatusId(orgId, "INVOICE_OUT"),
  ]);

  const invoiceOut = await prisma.invoiceOut.create({
    data: {
      orgId,
      number,
      statusId,
      clientId: order.clientId,
      contractId: order.contractId,
      legalEntityId: order.legalEntityId,
      orderId: order.id,
      lineItems: {
        create: order.lineItems.map((li) => ({
          catalogItemId: li.catalogItemId,
          variantId: li.variantId,
          quantity: li.quantity,
          unitPriceSnapshot: li.unitPriceSnapshot,
          currency: li.currency,
        })),
      },
    },
  });

  await notifyDocumentEvent(
    orgId, "INVOICE_OUT_CREATED", { invoiceOutId: invoiceOut.id }, "INVOICE_OUT", "CREATED", invoiceOut.id,
  );
  return { invoiceOutId: invoiceOut.id };
}

/**
 * Block M5: convenience shortcut, not the only way to create an invoice
 * (standalone creation via /invoices-out/new is fully supported).
 */
export async function createInvoiceFromOrder(orgSlug: string, orderId: string): Promise<void> {
  const ctx = await getOrgContext(orgSlug);
  assertPermission(ctx, "invoicesOut", "create");

  const result = await createInvoiceOutFromOrderRecord(ctx.orgId, orderId);
  if ("error" in result) {
    throw new Error(result.error);
  }

  revalidatePath(`/${orgSlug}/invoices-out`);
  redirect(`/${orgSlug}/invoices-out/${result.invoiceOutId}`);
}

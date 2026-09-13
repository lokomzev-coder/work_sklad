"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getOrgContext } from "@/lib/tenant";
import { assertPermission } from "@/lib/permissions";
import { getDefaultStatusId } from "@/lib/document-statuses";
import { getOrgBaseCurrency, getRateAt } from "@/lib/currency";
import { allocateFifo } from "@/lib/stock-batches";
import { getOrCreateWalkInClient } from "@/lib/retail-walk-in-client";
import { getOrderRemainingByKey } from "@/lib/orders";
import { registerFiscalReceipt } from "@/lib/fiscal/register-fiscal-receipt";
import { ManualConfirmationAdapter } from "@/lib/terminal/manual-confirmation-adapter";
import type { PaymentTerminalAdapter } from "@/lib/terminal/payment-terminal-adapter";

const lineSchema = z.object({
  catalogItemId: z.string().min(1),
  variantId: z.string().min(1).nullable().optional(),
  quantity: z.coerce.number().positive("Количество должно быть больше 0"),
});

const checkoutSchema = z.object({
  lineItems: z.array(lineSchema).min(1, "Добавьте хотя бы одну позицию"),
  clientId: z.string().min(1).nullable().optional(),
  paymentMethod: z.enum(["CASH", "CARD"]),
  // Block K remainder — "Создать документ" → "Розничная продажа" on an
  // Order links the resulting movement back to it, so the order's own
  // remaining-quantity tracking (lib/orders.ts::getOrderRemainingByKey)
  // counts it as fulfilled. Undefined/null for every plain walk-in
  // checkout (the overwhelming majority of calls) — no behavior change
  // there.
  orderId: z.string().min(1).nullable().optional(),
});

export interface CheckoutInput {
  lineItems: { catalogItemId: string; variantId?: string | null; quantity: number }[];
  clientId?: string | null;
  paymentMethod: "CASH" | "CARD";
  orderId?: string | null;
}

export interface CheckoutResult {
  error?: string;
  saleId?: string;
}

// v1 always uses the manual-confirmation stub (no real terminal hardware to
// wire up — see lib/terminal/inpas-smartsale-adapter.ts). Kept as a single
// swap point rather than hardcoding `new ManualConfirmationAdapter()` at
// each call site.
function getTerminalAdapter(): PaymentTerminalAdapter {
  return new ManualConfirmationAdapter();
}

async function nextRetailSaleNumber(orgId: string): Promise<number> {
  const last = await prisma.retailSale.findFirst({
    where: { orgId },
    orderBy: { number: "desc" },
    select: { number: true },
  });
  return (last?.number ?? 0) + 1;
}

async function nextStockMovementNumber(orgId: string): Promise<number> {
  const last = await prisma.stockMovement.findFirst({
    where: { orgId },
    orderBy: { number: "desc" },
    select: { number: true },
  });
  return (last?.number ?? 0) + 1;
}

/**
 * A walk-in POS checkout — the retail analogue of Order+createDemand+
 * Payment combined into one instant action, tied to the cashier's open
 * shift. See ROADMAP.md Block E for the full design.
 */
export async function checkoutSale(orgSlug: string, input: CheckoutInput): Promise<CheckoutResult> {
  const ctx = await getOrgContext(orgSlug);
  assertPermission(ctx, "retail", "create");

  if (!ctx.defaultStoreId) {
    return { error: "Обратитесь к администратору: не назначена точка продаж" };
  }
  if (!ctx.employeeId) {
    return { error: "Продажа доступна только сотруднику с привязанной карточкой" };
  }

  const parsed = checkoutSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Неверные данные" };
  }

  const shift = await prisma.retailShift.findFirst({
    where: { orgId: ctx.orgId, storeId: ctx.defaultStoreId, status: "OPEN" },
  });
  if (!shift) {
    return { error: "Смена не открыта" };
  }

  const catalogItemIds = [...new Set(parsed.data.lineItems.map((li) => li.catalogItemId))];
  const catalogItems = await prisma.catalogItem.findMany({
    where: { id: { in: catalogItemIds }, orgId: ctx.orgId },
    include: { unit: true },
  });
  if (catalogItems.length !== catalogItemIds.length) {
    return { error: "Один из товаров не найден" };
  }
  if (catalogItems.some((c) => c.type !== "PRODUCT")) {
    return { error: "Через кассу можно продавать только товары" };
  }
  const itemById = new Map(catalogItems.map((c) => [c.id, c]));

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

  const clientId = parsed.data.clientId ?? (await getOrCreateWalkInClient(ctx.orgId));

  const lineItemsCreateData = parsed.data.lineItems.map((li) => {
    const item = itemById.get(li.catalogItemId)!;
    const variant = li.variantId ? variantById.get(li.variantId) : undefined;
    return {
      catalogItemId: li.catalogItemId,
      variantId: li.variantId ?? undefined,
      quantity: li.quantity,
      unitPriceSnapshot: variant?.priceOverride ?? item.unitPrice,
      currency: item.currency,
    };
  });

  const total = lineItemsCreateData.reduce((sum, li) => sum + Number(li.unitPriceSnapshot) * Number(li.quantity), 0);
  // Same approximation already accepted throughout the project for mixed-
  // currency documents (e.g. Order): the first line's currency labels the
  // whole payment, no conversion.
  const currency = lineItemsCreateData[0].currency;

  if (parsed.data.paymentMethod === "CARD") {
    const terminal = getTerminalAdapter();
    const result = await terminal.requestPayment(total);
    if (!result.success) {
      return { error: result.error ?? "Оплата картой не прошла" };
    }
  }

  const [statusId, saleNumber, movementNumber, baseCurrency] = await Promise.all([
    getDefaultStatusId(ctx.orgId, "RETAIL_SALE"),
    nextRetailSaleNumber(ctx.orgId),
    nextStockMovementNumber(ctx.orgId),
    getOrgBaseCurrency(ctx.orgId),
  ]);
  const now = new Date();
  const rateSnapshot = currency === baseCurrency ? null : await getRateAt(ctx.orgId, currency, now);

  const sale = await prisma.$transaction(async (tx) => {
    const created = await tx.retailSale.create({
      data: {
        orgId: ctx.orgId,
        number: saleNumber,
        shiftId: shift.id,
        storeId: ctx.defaultStoreId!,
        clientId,
        statusId,
        lineItems: { create: lineItemsCreateData },
      },
    });

    const movement = await tx.stockMovement.create({
      data: {
        orgId: ctx.orgId,
        type: "RETAIL_SALE",
        number: movementNumber,
        storeId: ctx.defaultStoreId!,
        retailSaleId: created.id,
        orderId: parsed.data.orderId ?? undefined,
        lines: {
          create: lineItemsCreateData.map((li) => ({
            catalogItemId: li.catalogItemId,
            variantId: li.variantId,
            quantity: li.quantity,
            unitPriceSnapshot: li.unitPriceSnapshot,
            currency: li.currency,
            rateSnapshot,
          })),
        },
      },
      include: { lines: true },
    });
    for (const line of movement.lines) {
      await allocateFifo(tx, {
        orgId: ctx.orgId,
        catalogItemId: line.catalogItemId,
        variantId: line.variantId,
        demandLineId: line.id,
        quantity: Number(line.quantity),
      });
    }

    await tx.payment.create({
      data: {
        orgId: ctx.orgId,
        direction: "IN",
        amount: total,
        currency,
        rateSnapshot,
        counterpartyId: clientId,
        retailSaleId: created.id,
        // Block K remainder — links the payment back to the source order,
        // same as the movement above, so `computeOrderPaymentStatus`
        // (lib/orders.ts) reflects it on the order's own "Оплачено" badge.
        orderId: parsed.data.orderId ?? undefined,
        method: parsed.data.paymentMethod,
      },
    });

    return created;
  });

  const client = await prisma.client.findUnique({ where: { id: clientId }, select: { email: true } });
  registerFiscalReceipt(ctx.orgId, {
    documentType: "RETAIL_SALE",
    documentId: sale.id,
    retailSaleId: sale.id,
    externalId: sale.id,
    items: lineItemsCreateData.map((li) => ({
      name: itemById.get(li.catalogItemId)!.name,
      price: Number(li.unitPriceSnapshot),
      quantity: Number(li.quantity),
      sum: Number(li.unitPriceSnapshot) * Number(li.quantity),
      measurementUnit: itemById.get(li.catalogItemId)!.unit?.shortName ?? "шт",
      taxRate: itemById.get(li.catalogItemId)!.taxRate,
    })),
    total,
    clientEmail: client?.email ?? undefined,
    paymentMethod: parsed.data.paymentMethod,
  });

  revalidatePath(`/${orgSlug}/kassa`);
  revalidatePath(`/${orgSlug}/kassa/shift`);
  return { saleId: sale.id };
}

export interface CreateRetailSaleFromOrderResult {
  error?: string;
  saleId?: string;
}

/**
 * "Создать документ" → "Розничная продажа" (МойСклад model). A thin
 * wrapper over the already-complete `checkoutSale` above — this function's
 * own comment already frames a retail sale as "the retail analogue of
 * Order+createDemand+Payment combined into one instant action", which is
 * exactly the shortcut this menu item offers: a customer who placed this
 * order shows up in person, ring it up at the register instead of running
 * the formal Отгрузка+Счёт flow. No new orchestration beyond mapping the
 * order's remaining lines into `CheckoutInput` — same "нечего
 * отгружать"-style remaining-quantity source (`getOrderRemainingByKey`) as
 * `createDraftDemand`, and the same open-shift/default-store requirement
 * `checkoutSale` already enforces (surfaces as a normal error here, not a
 * new failure mode this action introduces).
 */
export async function createRetailSaleFromOrder(
  orgSlug: string,
  orderId: string,
): Promise<CreateRetailSaleFromOrderResult> {
  const ctx = await getOrgContext(orgSlug);
  assertPermission(ctx, "retail", "create");

  const order = await prisma.order.findFirst({ where: { id: orderId, orgId: ctx.orgId } });
  if (!order) {
    return { error: "Заказ не найден" };
  }

  const remainingByKey = await getOrderRemainingByKey(prisma, orderId);
  const remainingLines = [...remainingByKey.values()].filter((l) => l.quantity > 0);
  if (remainingLines.length === 0) {
    return { error: "Нечего продавать — всё уже отгружено" };
  }

  const result = await checkoutSale(orgSlug, {
    lineItems: remainingLines.map((l) => ({
      catalogItemId: l.catalogItemId,
      variantId: l.variantId,
      quantity: l.quantity,
    })),
    clientId: order.clientId,
    paymentMethod: "CARD",
    orderId,
  });
  // checkoutSale only revalidates its own /kassa paths — it doesn't know
  // this call originated from an order, so the order page's own
  // remaining-quantity display needs its own revalidation here.
  if (!result.error) {
    revalidatePath(`/${orgSlug}/orders/${orderId}`);
  }
  return result;
}

const returnSchema = z.object({
  lineItems: z.array(lineSchema).min(1, "Добавьте хотя бы одну позицию"),
  clientId: z.string().min(1).nullable().optional(),
  retailSaleId: z.string().min(1).nullable().optional(),
});

export interface CheckoutReturnInput {
  lineItems: { catalogItemId: string; variantId?: string | null; quantity: number }[];
  clientId?: string | null;
  retailSaleId?: string | null;
}

/** Mirror of checkoutSale — adds stock back (RETAIL_RETURN), Payment
 * direction OUT. retailSaleId is provenance only (optional — a return
 * doesn't require looking up the original sale), never re-synced. */
export async function checkoutReturn(orgSlug: string, input: CheckoutReturnInput): Promise<CheckoutResult> {
  const ctx = await getOrgContext(orgSlug);
  assertPermission(ctx, "retail", "create");

  if (!ctx.defaultStoreId) {
    return { error: "Обратитесь к администратору: не назначена точка продаж" };
  }
  if (!ctx.employeeId) {
    return { error: "Возврат доступен только сотруднику с привязанной карточкой" };
  }

  const parsed = returnSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Неверные данные" };
  }

  const shift = await prisma.retailShift.findFirst({
    where: { orgId: ctx.orgId, storeId: ctx.defaultStoreId, status: "OPEN" },
  });
  if (!shift) {
    return { error: "Смена не открыта" };
  }

  const catalogItemIds = [...new Set(parsed.data.lineItems.map((li) => li.catalogItemId))];
  const catalogItems = await prisma.catalogItem.findMany({
    where: { id: { in: catalogItemIds }, orgId: ctx.orgId },
  });
  if (catalogItems.length !== catalogItemIds.length) {
    return { error: "Один из товаров не найден" };
  }
  const itemById = new Map(catalogItems.map((c) => [c.id, c]));

  const variantIds = [
    ...new Set(parsed.data.lineItems.map((li) => li.variantId).filter((v): v is string => !!v)),
  ];
  const variants = variantIds.length
    ? await prisma.catalogItemVariant.findMany({ where: { id: { in: variantIds } } })
    : [];
  const variantById = new Map(variants.map((v) => [v.id, v]));

  const clientId = parsed.data.clientId ?? (await getOrCreateWalkInClient(ctx.orgId));

  const lineItemsCreateData = parsed.data.lineItems.map((li) => {
    const item = itemById.get(li.catalogItemId)!;
    const variant = li.variantId ? variantById.get(li.variantId) : undefined;
    return {
      catalogItemId: li.catalogItemId,
      variantId: li.variantId ?? undefined,
      quantity: li.quantity,
      unitPriceSnapshot: variant?.priceOverride ?? item.unitPrice,
      currency: item.currency,
    };
  });
  const total = lineItemsCreateData.reduce((sum, li) => sum + Number(li.unitPriceSnapshot) * Number(li.quantity), 0);
  const currency = lineItemsCreateData[0].currency;

  const [returnNumber, movementNumber, baseCurrency] = await Promise.all([
    (async () => {
      const last = await prisma.retailReturn.findFirst({ where: { orgId: ctx.orgId }, orderBy: { number: "desc" }, select: { number: true } });
      return (last?.number ?? 0) + 1;
    })(),
    nextStockMovementNumber(ctx.orgId),
    getOrgBaseCurrency(ctx.orgId),
  ]);
  const now = new Date();
  const rateSnapshot = currency === baseCurrency ? null : await getRateAt(ctx.orgId, currency, now);

  const ret = await prisma.$transaction(async (tx) => {
    const created = await tx.retailReturn.create({
      data: {
        orgId: ctx.orgId,
        number: returnNumber,
        shiftId: shift.id,
        storeId: ctx.defaultStoreId!,
        clientId,
        retailSaleId: parsed.data.retailSaleId ?? undefined,
        lineItems: { create: lineItemsCreateData },
      },
    });

    await tx.stockMovement.create({
      data: {
        orgId: ctx.orgId,
        type: "RETAIL_RETURN",
        number: movementNumber,
        storeId: ctx.defaultStoreId!,
        retailReturnId: created.id,
        lines: {
          create: lineItemsCreateData.map((li) => ({
            catalogItemId: li.catalogItemId,
            variantId: li.variantId,
            quantity: li.quantity,
            unitPriceSnapshot: li.unitPriceSnapshot,
            currency: li.currency,
            rateSnapshot,
          })),
        },
      },
    });

    await tx.payment.create({
      data: {
        orgId: ctx.orgId,
        direction: "OUT",
        amount: total,
        currency,
        rateSnapshot,
        counterpartyId: clientId,
        retailReturnId: created.id,
        // v1 scope cut: refunds always come out of the cash drawer,
        // regardless of how the original sale was paid (common real-world
        // practice, and keeps closeShift's cash reconciliation the single
        // source of truth for what's physically in the drawer). Refunding
        // back to a card is a real future need, not built here.
        method: "CASH",
      },
    });

    return created;
  });

  revalidatePath(`/${orgSlug}/kassa`);
  revalidatePath(`/${orgSlug}/kassa/shift`);
  return { saleId: ret.id };
}

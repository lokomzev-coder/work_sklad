"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getOrgContext } from "@/lib/tenant";
import { assertPermission } from "@/lib/permissions";
import { getDefaultStatusId, getAllowedNextStatusIds } from "@/lib/document-statuses";

const upsertProductionOrderSchema = z.object({
  techCardId: z.string().min(1, "Выберите техкарту"),
  storeId: z.string().min(1, "Выберите склад"),
  quantity: z.coerce.number().positive("Количество должно быть больше 0"),
  assignedEmployeeId: z.string().min(1).nullable(),
});

export interface UpsertProductionOrderInput {
  techCardId: string;
  storeId: string;
  quantity: number;
  assignedEmployeeId: string | null;
}

export interface ActionResult {
  error?: string;
  productionOrderId?: string;
}

async function nextProductionOrderNumber(orgId: string): Promise<number> {
  const last = await prisma.productionOrder.findFirst({
    where: { orgId },
    orderBy: { number: "desc" },
    select: { number: true },
  });
  return (last?.number ?? 0) + 1;
}

async function nextMovementNumber(orgId: string): Promise<number> {
  const last = await prisma.stockMovement.findFirst({
    where: { orgId },
    orderBy: { number: "desc" },
    select: { number: true },
  });
  return (last?.number ?? 0) + 1;
}

export async function upsertProductionOrder(
  orgSlug: string,
  productionOrderId: string | null,
  input: UpsertProductionOrderInput,
): Promise<ActionResult> {
  const ctx = await getOrgContext(orgSlug);
  assertPermission(ctx.role, "production", "edit");

  const parsed = upsertProductionOrderSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Неверные данные" };
  }

  const [techCard, store, employee] = await Promise.all([
    prisma.techCard.findFirst({ where: { id: parsed.data.techCardId, orgId: ctx.orgId, status: "ACTIVE" } }),
    prisma.store.findFirst({ where: { id: parsed.data.storeId, orgId: ctx.orgId, status: "ACTIVE" } }),
    parsed.data.assignedEmployeeId
      ? prisma.employee.findFirst({ where: { id: parsed.data.assignedEmployeeId, orgId: ctx.orgId } })
      : Promise.resolve(null),
  ]);
  if (!techCard) return { error: "Техкарта не найдена" };
  if (!store) return { error: "Склад не найден" };
  if (parsed.data.assignedEmployeeId && !employee) return { error: "Сотрудник не найден" };

  let productionOrderIdResult: string;

  if (productionOrderId) {
    const existing = await prisma.productionOrder.findFirst({
      where: { id: productionOrderId, orgId: ctx.orgId },
      select: { completedAt: true },
    });
    if (!existing) return { error: "Задание не найдено" };
    if (existing.completedAt) return { error: "Выполненное задание нельзя редактировать" };

    await prisma.productionOrder.update({
      where: { id: productionOrderId, orgId: ctx.orgId },
      data: {
        techCardId: parsed.data.techCardId,
        storeId: parsed.data.storeId,
        quantity: parsed.data.quantity,
        assignedEmployeeId: parsed.data.assignedEmployeeId,
      },
    });
    productionOrderIdResult = productionOrderId;
  } else {
    const [number, statusId] = await Promise.all([
      nextProductionOrderNumber(ctx.orgId),
      getDefaultStatusId(ctx.orgId, "PRODUCTION_ORDER"),
    ]);
    const productionOrder = await prisma.productionOrder.create({
      data: {
        orgId: ctx.orgId,
        number,
        statusId,
        techCardId: parsed.data.techCardId,
        storeId: parsed.data.storeId,
        quantity: parsed.data.quantity,
        assignedEmployeeId: parsed.data.assignedEmployeeId,
      },
    });
    productionOrderIdResult = productionOrder.id;
  }

  revalidatePath(`/${orgSlug}/production`);
  revalidatePath(`/${orgSlug}/production/${productionOrderIdResult}`);
  return { productionOrderId: productionOrderIdResult };
}

export async function updateProductionOrderStatus(
  orgSlug: string,
  productionOrderId: string,
  statusId: string,
) {
  const ctx = await getOrgContext(orgSlug);
  assertPermission(ctx.role, "production", "edit");

  const productionOrder = await prisma.productionOrder.findFirst({
    where: { id: productionOrderId, orgId: ctx.orgId },
    select: { statusId: true },
  });
  if (!productionOrder) {
    throw new Error("Задание не найдено");
  }

  const status = await prisma.documentStatus.findFirst({
    where: { id: statusId, orgId: ctx.orgId, kind: "PRODUCTION_ORDER" },
  });
  if (!status) {
    throw new Error("Статус не найден");
  }

  if (statusId !== productionOrder.statusId) {
    const allowed = await getAllowedNextStatusIds(ctx.orgId, "PRODUCTION_ORDER", productionOrder.statusId, {
      role: ctx.role,
      customRoleId: ctx.customRoleId,
      employeeId: ctx.employeeId,
    });
    if (!allowed.has(statusId)) {
      throw new Error("Такой переход между статусами запрещён");
    }
  }

  await prisma.productionOrder.update({
    where: { id: productionOrderId, orgId: ctx.orgId },
    data: { statusId },
  });

  revalidatePath(`/${orgSlug}/production`);
  revalidatePath(`/${orgSlug}/production/${productionOrderId}`);
}

/**
 * The one-time atomic posting: consumes techCard components (scaled to
 * order.quantity) from storeId and produces techCard.outputItem into the
 * same store, as two StockMovement rows sharing productionOrderId — same
 * ledger fulfillment.ts already uses for DEMAND/SUPPLY, just two directions
 * in one go instead of one. Guarded by completedAt so a second click can't
 * double-post (no confirmation dialog needed — the button itself disappears
 * once completedAt is set, see production order detail page).
 */
export async function completeProductionOrder(orgSlug: string, productionOrderId: string): Promise<ActionResult> {
  const ctx = await getOrgContext(orgSlug);
  assertPermission(ctx.role, "production", "edit");

  const productionOrder = await prisma.productionOrder.findFirst({
    where: { id: productionOrderId, orgId: ctx.orgId },
    include: { techCard: { include: { components: true } } },
  });
  if (!productionOrder) {
    return { error: "Задание не найдено" };
  }
  if (productionOrder.completedAt) {
    return { error: "Задание уже выполнено" };
  }
  if (productionOrder.techCard.components.length === 0) {
    return { error: "В техкарте нет материалов" };
  }

  const ratio = Number(productionOrder.quantity) / Number(productionOrder.techCard.outputQuantity);
  const consumeNumber = await nextMovementNumber(ctx.orgId);
  const outputNumber = consumeNumber + 1;

  await prisma.$transaction([
    prisma.stockMovement.create({
      data: {
        orgId: ctx.orgId,
        type: "PRODUCTION_CONSUME",
        number: consumeNumber,
        storeId: productionOrder.storeId,
        productionOrderId,
        lines: {
          create: productionOrder.techCard.components.map((c) => ({
            catalogItemId: c.catalogItemId,
            quantity: Number(c.quantity) * ratio,
          })),
        },
      },
    }),
    prisma.stockMovement.create({
      data: {
        orgId: ctx.orgId,
        type: "PRODUCTION_OUTPUT",
        number: outputNumber,
        storeId: productionOrder.storeId,
        productionOrderId,
        lines: {
          create: [
            {
              catalogItemId: productionOrder.techCard.outputItemId,
              quantity: productionOrder.quantity,
            },
          ],
        },
      },
    }),
    prisma.productionOrder.update({
      where: { id: productionOrderId },
      data: { completedAt: new Date() },
    }),
  ]);

  revalidatePath(`/${orgSlug}/production`);
  revalidatePath(`/${orgSlug}/production/${productionOrderId}`);
  revalidatePath(`/${orgSlug}/warehouse`);
  return { productionOrderId };
}

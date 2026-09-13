"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getOrgContext } from "@/lib/tenant";
import { assertPermission } from "@/lib/permissions";
import { assertRowScope, resolveGroupMemberIds } from "@/lib/scope";
import { getDefaultStatusId, getAllowedNextStatusIds } from "@/lib/document-statuses";
import { getStockBalances } from "@/lib/stock";
import { getLastPurchaseUnitCosts } from "@/lib/production-cost";
import { computeStageProgress } from "@/lib/production-stages";
import { dispatchWebhookEvent } from "@/lib/webhooks";
import { notifyDocumentEvent } from "@/lib/scenarios";
import { saveCustomFieldValuesRecord } from "@/lib/custom-fields";

const upsertProductionOrderSchema = z.object({
  techCardId: z.string().min(1, "Выберите техкарту"),
  materialsStoreId: z.string().min(1, "Выберите склад материалов"),
  productsStoreId: z.string().min(1, "Выберите склад продукции"),
  quantity: z.coerce.number().positive("Количество должно быть больше 0"),
  assignedEmployeeId: z.string().min(1).nullable(),
});

export interface UpsertProductionOrderInput {
  techCardId: string;
  materialsStoreId: string;
  productsStoreId: string;
  quantity: number;
  assignedEmployeeId: string | null;
  customFieldValues?: Record<string, string>;
}

export interface ActionResult {
  error?: string;
  productionOrderId?: string;
}

export interface CompleteProductionOrderResult {
  error?: string;
  productionOrderId?: string;
  warnings?: string[];
}

export interface CompleteProductionStageResult {
  error?: string;
  productionStageId?: string;
  warnings?: string[];
  fullyCompletedOrder?: boolean;
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
  assertPermission(ctx, "productionOrders", productionOrderId ? "edit" : "create");
  if (productionOrderId) {
    await assertRowScope(ctx, "productionOrders", productionOrderId);
  }

  const parsed = upsertProductionOrderSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Неверные данные" };
  }
  // Mirrors upsertOrder: an OWN-scoped custom role can only ever create/keep
  // production orders assigned to itself — override rather than reject, so
  // the combobox stays editable without a special-cased read-only variant.
  // OWN_GROUP validates against the actor's own department instead.
  const productionEditScope = ctx.capabilities.productionOrders.edit;
  if (productionEditScope === "OWN") {
    parsed.data.assignedEmployeeId = ctx.employeeId;
  } else if (productionEditScope === "OWN_GROUP" && parsed.data.assignedEmployeeId) {
    const memberIds = ctx.groupId ? await resolveGroupMemberIds(ctx.orgId, ctx.groupId) : [];
    if (!memberIds.includes(parsed.data.assignedEmployeeId)) {
      return { error: "Можно назначить только на сотрудника вашего отдела" };
    }
  }

  const [techCard, materialsStore, productsStore, employee] = await Promise.all([
    prisma.techCard.findFirst({
      where: { id: parsed.data.techCardId, orgId: ctx.orgId, status: "ACTIVE" },
      include: { techProcess: { include: { positions: { orderBy: { position: "asc" } } } } },
    }),
    prisma.store.findFirst({ where: { id: parsed.data.materialsStoreId, orgId: ctx.orgId, status: "ACTIVE" } }),
    prisma.store.findFirst({ where: { id: parsed.data.productsStoreId, orgId: ctx.orgId, status: "ACTIVE" } }),
    parsed.data.assignedEmployeeId
      ? prisma.employee.findFirst({ where: { id: parsed.data.assignedEmployeeId, orgId: ctx.orgId } })
      : Promise.resolve(null),
  ]);
  if (!techCard) return { error: "Техкарта не найдена" };
  if (!materialsStore) return { error: "Склад материалов не найден" };
  if (!productsStore) return { error: "Склад продукции не найден" };
  if (parsed.data.assignedEmployeeId && !employee) return { error: "Сотрудник не найден" };

  let productionOrderIdResult: string;
  let isNewOrder = false;

  if (productionOrderId) {
    const existing = await prisma.productionOrder.findFirst({
      where: { id: productionOrderId, orgId: ctx.orgId },
      select: { completedAt: true, completedQuantity: true, techCardId: true, materialsStoreId: true, productsStoreId: true },
    });
    if (!existing) return { error: "Задание не найдено" };
    if (existing.completedAt) return { error: "Выполненное задание нельзя редактировать" };

    const completedQuantity = Number(existing.completedQuantity);
    if (completedQuantity > 0) {
      if (
        parsed.data.techCardId !== existing.techCardId ||
        parsed.data.materialsStoreId !== existing.materialsStoreId ||
        parsed.data.productsStoreId !== existing.productsStoreId
      ) {
        return { error: "Нельзя менять техкарту или склады после частичного выполнения" };
      }
      if (parsed.data.quantity < completedQuantity) {
        return { error: `Количество не может быть меньше уже выполненного (${completedQuantity})` };
      }
    }

    await prisma.productionOrder.update({
      where: { id: productionOrderId, orgId: ctx.orgId },
      data: {
        techCardId: parsed.data.techCardId,
        materialsStoreId: parsed.data.materialsStoreId,
        productsStoreId: parsed.data.productsStoreId,
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
        materialsStoreId: parsed.data.materialsStoreId,
        productsStoreId: parsed.data.productsStoreId,
        quantity: parsed.data.quantity,
        assignedEmployeeId: parsed.data.assignedEmployeeId,
        // Block F2: a multi-stage TechCard gets one ProductionStage per
        // TechProcessPosition, each carrying the full order quantity as its
        // totalQuantity (linear chain — every unit passes through every
        // stage). Auto-generated here and never created/removed by direct
        // user action (see ProductionStage doc comment in schema.prisma).
        ...(techCard.techProcess
          ? {
              stages: {
                create: techCard.techProcess.positions.map((position) => ({
                  orgId: ctx.orgId,
                  techProcessPositionId: position.id,
                  position: position.position,
                  totalQuantity: parsed.data.quantity,
                })),
              },
            }
          : {}),
      },
    });
    productionOrderIdResult = productionOrder.id;
    isNewOrder = true;
  }

  if (input.customFieldValues) {
    await saveCustomFieldValuesRecord(ctx.orgId, "PRODUCTION_ORDER", productionOrderIdResult, input.customFieldValues);
  }

  revalidatePath(`/${orgSlug}/production`);
  revalidatePath(`/${orgSlug}/production/${productionOrderIdResult}`);
  if (isNewOrder) {
    await notifyDocumentEvent(
      ctx.orgId, "PRODUCTION_ORDER_CREATED", { productionOrderId: productionOrderIdResult }, "PRODUCTION_ORDER", "CREATED", productionOrderIdResult,
    );
  }
  return { productionOrderId: productionOrderIdResult };
}

export async function updateProductionOrderStatus(
  orgSlug: string,
  productionOrderId: string,
  statusId: string,
) {
  const ctx = await getOrgContext(orgSlug);
  assertPermission(ctx, "productionOrders", "edit");
  await assertRowScope(ctx, "productionOrders", productionOrderId);

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
  await notifyDocumentEvent(
    ctx.orgId, "PRODUCTION_ORDER_STATUS_CHANGED", { productionOrderId, statusId }, "PRODUCTION_ORDER", "STATUS_CHANGED", productionOrderId,
  );
}

/**
 * Posts one increment of production: consumes techCard components (scaled to
 * `partialQuantity`, or the whole remainder if omitted) from materialsStoreId
 * and produces the same quantity of techCard.outputItem into productsStoreId,
 * as two StockMovement rows sharing productionOrderId — same ledger
 * fulfillment.ts uses for DEMAND/SUPPLY. Can be called multiple times against
 * one order (partial completion); completedAt is only set once
 * completedQuantity reaches the order's full quantity, at which point no
 * further calls (or edits) are possible.
 *
 * Only for single-step TechCards (techProcessId null) — a multi-stage
 * TechCard must go through completeProductionStage per stage instead, since
 * this function has no notion of stage-scoped materials or blocking.
 *
 * Both the consumed materials and the produced output are costed: materials
 * at their last known SUPPLY price (lib/production-cost.ts — the project
 * doesn't do FIFO/weighted-average anywhere, this matches that precedent),
 * plus techCard.laborCost scaled by the same ratio; the output's
 * unitPriceSnapshot is the resulting total divided by the quantity produced
 * in this call. Stock sufficiency is checked and enforced before the
 * transaction — going negative silently is not allowed (mirrors createDemand's
 * over-fulfillment guard).
 */
export async function completeProductionOrder(
  orgSlug: string,
  productionOrderId: string,
  partialQuantity?: number,
): Promise<CompleteProductionOrderResult> {
  const ctx = await getOrgContext(orgSlug);
  assertPermission(ctx, "productionOrders", "edit");
  await assertRowScope(ctx, "productionOrders", productionOrderId);

  const productionOrder = await prisma.productionOrder.findFirst({
    where: { id: productionOrderId, orgId: ctx.orgId },
    include: { techCard: { include: { components: true } } },
  });
  if (!productionOrder) {
    return { error: "Задание не найдено" };
  }
  if (productionOrder.techCard.techProcessId) {
    return { error: "У этой техкарты есть техпроцесс — выполняйте задание по этапам" };
  }
  if (productionOrder.completedAt) {
    return { error: "Задание уже полностью выполнено" };
  }

  const totalQuantity = Number(productionOrder.quantity);
  const completedSoFar = Number(productionOrder.completedQuantity);
  const remaining = totalQuantity - completedSoFar;
  if (remaining <= 0) {
    return { error: "Задание уже полностью выполнено" };
  }

  const qty = partialQuantity ?? remaining;
  if (!(qty > 0)) {
    return { error: "Количество должно быть больше 0" };
  }
  if (qty > remaining) {
    return { error: `Нельзя выполнить больше, чем осталось (доступно: ${remaining})` };
  }

  if (productionOrder.techCard.components.length === 0) {
    return { error: "В техкарте нет материалов" };
  }

  const ratio = qty / Number(productionOrder.techCard.outputQuantity);
  const componentIds = productionOrder.techCard.components.map((c) => c.catalogItemId);

  const balances = await getStockBalances(ctx.orgId, { storeId: productionOrder.materialsStoreId });
  const balanceByItem = new Map(balances.map((b) => [b.catalogItemId, Number(b.quantity)]));
  const shortages: string[] = [];
  for (const component of productionOrder.techCard.components) {
    const needed = Number(component.quantity) * ratio;
    const available = balanceByItem.get(component.catalogItemId) ?? 0;
    if (available < needed) {
      const item = await prisma.catalogItem.findUnique({ where: { id: component.catalogItemId }, select: { name: true } });
      shortages.push(`${item?.name ?? component.catalogItemId} (нужно ${needed}, есть ${available})`);
    }
  }
  if (shortages.length > 0) {
    return { error: `Недостаточно остатка сырья: ${shortages.join(", ")}` };
  }

  const unitCosts = await getLastPurchaseUnitCosts(ctx.orgId, componentIds);
  const warnings: string[] = [];
  let consumedCost = 0;
  const consumeLinesCreateData = productionOrder.techCard.components.map((c) => {
    const lookup = unitCosts.get(c.catalogItemId);
    const quantity = Number(c.quantity) * ratio;
    const unitCost = lookup?.unitCost ?? 0;
    if (!lookup?.hasHistory) {
      warnings.push(`Нет истории закупок для расчёта себестоимости компонента (списан по цене 0)`);
    }
    consumedCost += quantity * unitCost;
    return {
      catalogItemId: c.catalogItemId,
      quantity,
      unitPriceSnapshot: unitCost,
    };
  });

  const laborCost = Number(productionOrder.techCard.laborCost ?? 0) * ratio;
  const outputUnitCost = (consumedCost + laborCost) / qty;

  const newCompletedQuantity = completedSoFar + qty;
  const fullyCompleted = newCompletedQuantity >= totalQuantity;

  const consumeNumber = await nextMovementNumber(ctx.orgId);
  const outputNumber = consumeNumber + 1;

  await prisma.$transaction([
    prisma.stockMovement.create({
      data: {
        orgId: ctx.orgId,
        type: "PRODUCTION_CONSUME",
        number: consumeNumber,
        storeId: productionOrder.materialsStoreId,
        productionOrderId,
        lines: { create: consumeLinesCreateData },
      },
    }),
    prisma.stockMovement.create({
      data: {
        orgId: ctx.orgId,
        type: "PRODUCTION_OUTPUT",
        number: outputNumber,
        storeId: productionOrder.productsStoreId,
        productionOrderId,
        lines: {
          create: [
            {
              catalogItemId: productionOrder.techCard.outputItemId,
              quantity: qty,
              unitPriceSnapshot: outputUnitCost,
            },
          ],
        },
      },
    }),
    prisma.productionOrder.update({
      where: { id: productionOrderId },
      data: {
        completedQuantity: { increment: qty },
        ...(fullyCompleted ? { completedAt: new Date() } : {}),
      },
    }),
  ]);

  revalidatePath(`/${orgSlug}/production`);
  revalidatePath(`/${orgSlug}/production/${productionOrderId}`);
  revalidatePath(`/${orgSlug}/warehouse`);
  dispatchWebhookEvent(ctx.orgId, "PRODUCTION_ORDER_COMPLETED", {
    productionOrderId,
    quantityCompleted: qty,
    fullyCompleted,
  });
  return { productionOrderId, warnings: warnings.length > 0 ? [...new Set(warnings)] : undefined };
}

/**
 * Block F2: posts one increment of ONE stage of a multi-stage ProductionOrder
 * (techCard.techProcessId set). Materials consumed are only those
 * TechCardComponents pinned to this stage's TechProcessPosition (or, for
 * components with no explicit position, the FIRST position — МойСклад's own
 * default-to-first-stage rule). Output (PRODUCTION_OUTPUT + the order's own
 * completedQuantity/completedAt) is only posted when this is the LAST stage
 * — earlier stages only consume, matching МойСклад (products only appear on
 * a processingstagecompletion for the final stage).
 *
 * `quantity` is validated server-side against computeStageProgress's
 * availableQuantity — a stage can't be worked ahead of how much the
 * preceding stage has completed (the "blocked" mechanism), and the UI's
 * button being disabled is not the only enforcement (see cybersecurity notes
 * in the Block F2 plan).
 */
export async function completeProductionStage(
  orgSlug: string,
  productionStageId: string,
  partialQuantity?: number,
): Promise<CompleteProductionStageResult> {
  const ctx = await getOrgContext(orgSlug);
  assertPermission(ctx, "productionOrders", "edit");

  const stage = await prisma.productionStage.findFirst({
    where: { id: productionStageId, orgId: ctx.orgId },
    include: {
      productionOrder: { include: { techCard: { include: { components: true } } } },
      techProcessPosition: true,
    },
  });
  if (!stage) {
    return { error: "Этап не найден" };
  }
  await assertRowScope(ctx, "productionOrders", stage.productionOrderId);

  if (stage.productionOrder.completedAt) {
    return { error: "Задание уже полностью выполнено" };
  }

  const siblingStages = await prisma.productionStage.findMany({
    where: { productionOrderId: stage.productionOrderId },
    orderBy: { position: "asc" },
  });
  const maxPosition = Math.max(...siblingStages.map((s) => s.position));
  const precedingStage = siblingStages.find((s) => s.position === stage.position - 1) ?? null;

  const progress = computeStageProgress(
    {
      totalQuantity: Number(stage.totalQuantity),
      completedQuantity: Number(stage.completedQuantity),
      position: stage.position,
    },
    precedingStage ? { completedQuantity: Number(precedingStage.completedQuantity) } : null,
    maxPosition,
  );

  const qty = partialQuantity ?? progress.availableQuantity;
  if (!(qty > 0)) {
    return { error: "Количество должно быть больше 0" };
  }
  if (qty > progress.availableQuantity) {
    return {
      error: `Нельзя выполнить больше, чем доступно на этом этапе (доступно: ${progress.availableQuantity}, заблокировано: ${progress.blockedQuantity})`,
    };
  }

  const outputQuantity = Number(stage.productionOrder.techCard.outputQuantity);
  const ratio = qty / outputQuantity;

  // Materials pinned to this position, plus unassigned materials IF this is
  // the first position (МойСклад's default-to-first-stage rule).
  const components = stage.productionOrder.techCard.components.filter(
    (c) =>
      c.techProcessPositionId === stage.techProcessPositionId ||
      (c.techProcessPositionId === null && stage.position === 0),
  );

  const balances = await getStockBalances(ctx.orgId, { storeId: stage.productionOrder.materialsStoreId });
  const balanceByItem = new Map(balances.map((b) => [b.catalogItemId, Number(b.quantity)]));
  const shortages: string[] = [];
  for (const component of components) {
    const needed = Number(component.quantity) * ratio;
    const available = balanceByItem.get(component.catalogItemId) ?? 0;
    if (available < needed) {
      const item = await prisma.catalogItem.findUnique({ where: { id: component.catalogItemId }, select: { name: true } });
      shortages.push(`${item?.name ?? component.catalogItemId} (нужно ${needed}, есть ${available})`);
    }
  }
  if (shortages.length > 0) {
    return { error: `Недостаточно остатка сырья: ${shortages.join(", ")}` };
  }

  const warnings: string[] = [];
  let consumeLinesCreateData: { catalogItemId: string; quantity: number; unitPriceSnapshot: number }[] = [];
  if (components.length > 0) {
    const unitCosts = await getLastPurchaseUnitCosts(ctx.orgId, components.map((c) => c.catalogItemId));
    consumeLinesCreateData = components.map((c) => {
      const lookup = unitCosts.get(c.catalogItemId);
      const quantity = Number(c.quantity) * ratio;
      const unitCost = lookup?.unitCost ?? 0;
      if (!lookup?.hasHistory) {
        warnings.push(`Нет истории закупок для расчёта себестоимости компонента (списан по цене 0)`);
      }
      return { catalogItemId: c.catalogItemId, quantity, unitPriceSnapshot: unitCost };
    });
  }
  const consumedCost = consumeLinesCreateData.reduce((sum, l) => sum + l.quantity * l.unitPriceSnapshot, 0);

  const isLast = progress.isLast;
  const orderTotalQuantity = Number(stage.productionOrder.quantity);
  const orderCompletedSoFar = Number(stage.productionOrder.completedQuantity);
  const newOrderCompletedQuantity = orderCompletedSoFar + qty;
  const orderFullyCompleted = isLast && newOrderCompletedQuantity >= orderTotalQuantity;

  let outputUnitCost = 0;
  if (isLast) {
    // In a real recipe, most raw materials are consumed at an EARLY stage
    // (e.g. "Замес"/mixing), not the final one ("Выпечка"/baking) — so
    // costing the output from only *this* stage's own consumedCost would
    // systematically ignore most of the order's material cost, not just in
    // an edge case. Instead: sum all PRODUCTION_CONSUME cost ever posted for
    // this order (every earlier stage's completions, plus this call's own)
    // minus whatever material cost earlier PRODUCTION_OUTPUT postings (from
    // prior partial final-stage completions) already accounted for — the
    // remainder is "unattributed" material cost sitting in this batch, which
    // gets folded into the output being posted right now. Same
    // weighted-average-not-FIFO precision level as the rest of this project.
    const [pastConsumeLines, pastOutputLines] = await Promise.all([
      prisma.stockMovementLine.findMany({
        where: { movement: { productionOrderId: stage.productionOrderId, type: "PRODUCTION_CONSUME" } },
        select: { quantity: true, unitPriceSnapshot: true },
      }),
      prisma.stockMovementLine.findMany({
        where: { movement: { productionOrderId: stage.productionOrderId, type: "PRODUCTION_OUTPUT" } },
        select: { quantity: true, unitPriceSnapshot: true },
      }),
    ]);
    const pastConsumedCost = pastConsumeLines.reduce(
      (sum, l) => sum + Number(l.quantity) * Number(l.unitPriceSnapshot ?? 0),
      0,
    );
    const pastOutputCost = pastOutputLines.reduce(
      (sum, l) => sum + Number(l.quantity) * Number(l.unitPriceSnapshot ?? 0),
      0,
    );
    const unattributedMaterialCost = Math.max(0, pastConsumedCost + consumedCost - pastOutputCost);
    // Labor cost is linear in quantity, so scaling by this call's own ratio
    // already gives the correct proportional share regardless of timing —
    // no accumulation needed here, unlike materials above.
    const laborCost = Number(stage.productionOrder.techCard.laborCost ?? 0) * ratio;
    outputUnitCost = (unattributedMaterialCost + laborCost) / qty;
  }

  const movementOps = [];
  if (consumeLinesCreateData.length > 0) {
    const consumeNumber = await nextMovementNumber(ctx.orgId);
    movementOps.push(
      prisma.stockMovement.create({
        data: {
          orgId: ctx.orgId,
          type: "PRODUCTION_CONSUME",
          number: consumeNumber,
          storeId: stage.productionOrder.materialsStoreId,
          productionOrderId: stage.productionOrderId,
          lines: { create: consumeLinesCreateData },
        },
      }),
    );
  }
  if (isLast) {
    const outputNumber = await nextMovementNumber(ctx.orgId);
    movementOps.push(
      prisma.stockMovement.create({
        data: {
          orgId: ctx.orgId,
          type: "PRODUCTION_OUTPUT",
          number: outputNumber,
          storeId: stage.productionOrder.productsStoreId,
          productionOrderId: stage.productionOrderId,
          lines: {
            create: [
              {
                catalogItemId: stage.productionOrder.techCard.outputItemId,
                quantity: qty,
                unitPriceSnapshot: outputUnitCost,
              },
            ],
          },
        },
      }),
    );
  }

  await prisma.$transaction([
    ...movementOps,
    prisma.productionStage.update({
      where: { id: productionStageId },
      data: { completedQuantity: { increment: qty } },
    }),
    prisma.productionStageCompletion.create({
      data: { productionStageId, quantity: qty, employeeId: ctx.employeeId },
    }),
    ...(isLast
      ? [
          prisma.productionOrder.update({
            where: { id: stage.productionOrderId },
            data: {
              completedQuantity: { increment: qty },
              ...(orderFullyCompleted ? { completedAt: new Date() } : {}),
            },
          }),
        ]
      : []),
  ]);

  revalidatePath(`/${orgSlug}/production`);
  revalidatePath(`/${orgSlug}/production/${stage.productionOrderId}`);
  revalidatePath(`/${orgSlug}/warehouse`);
  if (isLast) {
    dispatchWebhookEvent(ctx.orgId, "PRODUCTION_ORDER_COMPLETED", {
      productionOrderId: stage.productionOrderId,
      quantityCompleted: qty,
      fullyCompleted: orderFullyCompleted,
    });
  }
  return {
    productionStageId,
    warnings: warnings.length > 0 ? [...new Set(warnings)] : undefined,
    fullyCompletedOrder: orderFullyCompleted,
  };
}

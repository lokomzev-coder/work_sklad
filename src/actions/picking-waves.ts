"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getOrgContext } from "@/lib/tenant";
import { assertPermission } from "@/lib/permissions";
import { createDraftDemandRecord } from "@/actions/fulfillment";

export interface CreatePickingWaveResult {
  error?: string;
}

async function nextPickingWaveNumber(orgId: string): Promise<number> {
  const last = await prisma.pickingWave.findFirst({
    where: { orgId },
    orderBy: { number: "desc" },
    select: { number: true },
  });
  return (last?.number ?? 0) + 1;
}

/**
 * "Создать документ" → "Волна отбора" (МойСклад model), started from a
 * multi-select on the Orders list (not from a single order's own menu,
 * unlike every other item in this chain — a wave only makes sense across
 * several orders at once). Just a grouping record — see PickingWave's own
 * schema comment for why it deliberately has no status/lifecycle of its
 * own.
 */
export async function createPickingWave(orgSlug: string, orderIds: string[]): Promise<CreatePickingWaveResult> {
  const ctx = await getOrgContext(orgSlug);
  assertPermission(ctx, "warehouse", "create");

  const uniqueIds = [...new Set(orderIds)];
  if (uniqueIds.length === 0) {
    return { error: "Выберите хотя бы один заказ" };
  }

  const orders = await prisma.order.findMany({ where: { id: { in: uniqueIds }, orgId: ctx.orgId } });
  if (orders.length !== uniqueIds.length) {
    return { error: "Один из заказов не найден" };
  }

  const number = await nextPickingWaveNumber(ctx.orgId);
  const wave = await prisma.pickingWave.create({
    data: {
      orgId: ctx.orgId,
      number,
      createdById: ctx.employeeId,
      orders: { create: uniqueIds.map((orderId) => ({ orderId })) },
    },
  });

  revalidatePath(`/${orgSlug}/warehouse/picking-waves`);
  redirect(`/${orgSlug}/warehouse/picking-waves/${wave.id}`);
}

export interface CreateDraftDemandsForWaveResult {
  error?: string;
  created?: number;
  skipped?: number;
}

/**
 * "Создать отгрузки" on a wave's own page — calls `createDraftDemandRecord`
 * (actions/fulfillment.ts, factored out of `createDraftDemand` for exactly
 * this) once per order in the wave. An individual order with nothing left
 * to ship is a normal, expected outcome for a wave (orders naturally end up
 * at different stages) — counted as "skipped", not surfaced as an error
 * that would abort the whole batch.
 */
export async function createDraftDemandsForWave(
  orgSlug: string,
  waveId: string,
): Promise<CreateDraftDemandsForWaveResult> {
  const ctx = await getOrgContext(orgSlug);
  assertPermission(ctx, "warehouse", "create");

  const wave = await prisma.pickingWave.findFirst({
    where: { id: waveId, orgId: ctx.orgId },
    include: { orders: true },
  });
  if (!wave) {
    return { error: "Волна отбора не найдена" };
  }

  let created = 0;
  let skipped = 0;
  for (const waveOrder of wave.orders) {
    const result = await createDraftDemandRecord(ctx, waveOrder.orderId);
    if ("error" in result) {
      skipped++;
    } else {
      created++;
    }
  }

  revalidatePath(`/${orgSlug}/warehouse/picking-waves/${waveId}`);
  return { created, skipped };
}

"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { getOrgContext } from "@/lib/tenant";
import { assertPermission } from "@/lib/permissions";

export interface ActionResult {
  error?: string;
}

function requireStoreId(defaultStoreId: string | null): { storeId: string } | { error: string } {
  if (!defaultStoreId) {
    return { error: "Обратитесь к администратору: не назначена точка продаж" };
  }
  return { storeId: defaultStoreId };
}

/** Opens a new shift for the cashier's assigned store. Rejects if a shift
 * is already OPEN there — enforced at the application level (no DB
 * constraint), same convention as most business invariants in this
 * project. */
export async function openShift(
  orgSlug: string,
  openingCashAmount: number,
): Promise<ActionResult & { shiftId?: string }> {
  const ctx = await getOrgContext(orgSlug);
  assertPermission(ctx, "retail", "create");

  const store = requireStoreId(ctx.defaultStoreId);
  if ("error" in store) return store;

  if (!ctx.employeeId) {
    return { error: "Открытие смены доступно только сотруднику с привязанной карточкой" };
  }
  if (!Number.isFinite(openingCashAmount) || openingCashAmount < 0) {
    return { error: "Некорректная сумма в кассе" };
  }

  const existing = await prisma.retailShift.findFirst({
    where: { orgId: ctx.orgId, storeId: store.storeId, status: "OPEN" },
  });
  if (existing) {
    return { error: "На этой точке продаж уже открыта смена" };
  }

  const shift = await prisma.retailShift.create({
    data: {
      orgId: ctx.orgId,
      storeId: store.storeId,
      openedById: ctx.employeeId,
      openingCashAmount,
    },
  });

  revalidatePath(`/${orgSlug}/kassa`);
  return { shiftId: shift.id };
}

export async function recordCashTransaction(
  orgSlug: string,
  shiftId: string,
  type: "CASH_IN" | "CASH_OUT",
  amount: number,
  comment?: string,
): Promise<ActionResult> {
  const ctx = await getOrgContext(orgSlug);
  assertPermission(ctx, "retail", "create");

  if (!ctx.employeeId) {
    return { error: "Операция доступна только сотруднику с привязанной карточкой" };
  }
  if (!Number.isFinite(amount) || amount <= 0) {
    return { error: "Некорректная сумма" };
  }

  const shift = await prisma.retailShift.findFirst({
    where: { id: shiftId, orgId: ctx.orgId, status: "OPEN" },
  });
  if (!shift) {
    return { error: "Смена не найдена или уже закрыта" };
  }

  await prisma.cashTransaction.create({
    data: { shiftId, type, amount, comment, createdById: ctx.employeeId },
  });

  revalidatePath(`/${orgSlug}/kassa/shift`);
  return {};
}

async function computeExpectedCash(shiftId: string, openingCashAmount: number): Promise<number> {
  const [cashSales, cashReturns, cashIn, cashOut] = await Promise.all([
    prisma.payment.aggregate({
      where: { retailSale: { shiftId }, method: "CASH" },
      _sum: { amount: true },
    }),
    prisma.payment.aggregate({
      where: { retailReturn: { shiftId }, method: "CASH" },
      _sum: { amount: true },
    }),
    prisma.cashTransaction.aggregate({
      where: { shiftId, type: "CASH_IN" },
      _sum: { amount: true },
    }),
    prisma.cashTransaction.aggregate({
      where: { shiftId, type: "CASH_OUT" },
      _sum: { amount: true },
    }),
  ]);

  return (
    openingCashAmount +
    Number(cashSales._sum.amount ?? 0) -
    Number(cashReturns._sum.amount ?? 0) +
    Number(cashIn._sum.amount ?? 0) -
    Number(cashOut._sum.amount ?? 0)
  );
}

/** Closes a shift, computing expectedCashAmount server-side (never trusted
 * from the client) and storing it alongside the cashier's own physical
 * count — a mismatch is surfaced on the closing report, never silently
 * corrected. */
export interface CloseShiftResult extends ActionResult {
  expectedCashAmount?: number;
  countedCashAmount?: number;
}

export async function closeShift(
  orgSlug: string,
  shiftId: string,
  countedCashAmount: number,
): Promise<CloseShiftResult> {
  const ctx = await getOrgContext(orgSlug);
  assertPermission(ctx, "retail", "edit");

  if (!ctx.employeeId) {
    return { error: "Закрытие смены доступно только сотруднику с привязанной карточкой" };
  }
  if (!Number.isFinite(countedCashAmount) || countedCashAmount < 0) {
    return { error: "Некорректная пересчитанная сумма" };
  }

  const shift = await prisma.retailShift.findFirst({
    where: { id: shiftId, orgId: ctx.orgId, status: "OPEN" },
  });
  if (!shift) {
    return { error: "Смена не найдена или уже закрыта" };
  }

  const expectedCashAmount = await computeExpectedCash(shiftId, Number(shift.openingCashAmount));

  await prisma.retailShift.update({
    where: { id: shiftId },
    data: {
      status: "CLOSED",
      closedById: ctx.employeeId,
      closedAt: new Date(),
      expectedCashAmount,
      countedCashAmount,
    },
  });

  revalidatePath(`/${orgSlug}/kassa`);
  revalidatePath(`/${orgSlug}/kassa/shift`);
  return { expectedCashAmount, countedCashAmount };
}

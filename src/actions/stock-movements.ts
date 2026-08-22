"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getOrgContext } from "@/lib/tenant";
import { assertPermission } from "@/lib/permissions";
import { getItemBalanceAtStore } from "@/lib/stock";
import type { StockMovementType } from "@/generated/prisma/enums";

const lineSchema = z.object({
  catalogItemId: z.string().min(1),
  quantity: z.coerce.number("Укажите количество"),
});

const createMovementSchema = z.object({
  storeId: z.string().min(1, "Выберите склад"),
  toStoreId: z.string().min(1).nullable().optional(),
  comment: z
    .string()
    .trim()
    .max(500)
    .optional()
    .transform((v) => v || undefined),
  lines: z.array(lineSchema).min(1, "Добавьте хотя бы одну позицию"),
});

export interface CreateStockMovementInput {
  storeId: string;
  toStoreId?: string | null;
  comment?: string;
  lines: { catalogItemId: string; quantity: number }[];
}

export interface CreateStockMovementResult {
  error?: string;
  movementId?: string;
}

async function nextMovementNumber(orgId: string): Promise<number> {
  const last = await prisma.stockMovement.findFirst({
    where: { orgId },
    orderBy: { number: "desc" },
    select: { number: true },
  });
  return (last?.number ?? 0) + 1;
}

export async function createStockMovement(
  orgSlug: string,
  type: StockMovementType,
  input: CreateStockMovementInput,
): Promise<CreateStockMovementResult> {
  const ctx = await getOrgContext(orgSlug);
  assertPermission(ctx.role, "warehouse", "edit");

  const parsed = createMovementSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Неверные данные" };
  }
  const data = parsed.data;

  if (type === "MOVE") {
    if (!data.toStoreId) {
      return { error: "Выберите склад назначения" };
    }
    if (data.toStoreId === data.storeId) {
      return { error: "Склад назначения должен отличаться от исходного" };
    }
  } else if (data.toStoreId) {
    return { error: "Склад назначения указывается только для перемещения" };
  }

  if (type !== "INVENTORY") {
    for (const line of data.lines) {
      if (line.quantity <= 0) {
        return { error: "Количество должно быть больше 0" };
      }
    }
  } else {
    for (const line of data.lines) {
      if (line.quantity < 0) {
        return { error: "Фактическое количество не может быть отрицательным" };
      }
    }
  }

  const storeIds = [
    ...new Set([data.storeId, ...(data.toStoreId ? [data.toStoreId] : [])]),
  ];
  const stores = await prisma.store.findMany({
    where: { id: { in: storeIds }, orgId: ctx.orgId, status: "ACTIVE" },
  });
  if (stores.length !== storeIds.length) {
    return { error: "Один из складов не найден или в архиве" };
  }

  const catalogItemIds = [...new Set(data.lines.map((l) => l.catalogItemId))];
  const catalogItems = await prisma.catalogItem.findMany({
    where: { id: { in: catalogItemIds }, orgId: ctx.orgId },
  });
  if (catalogItems.length !== catalogItemIds.length) {
    return { error: "Один из товаров не найден" };
  }

  let linesCreateData: {
    catalogItemId: string;
    quantity: number;
    countedQuantity?: number;
  }[];

  if (type === "INVENTORY") {
    linesCreateData = await Promise.all(
      data.lines.map(async (line) => {
        const currentBalance = await getItemBalanceAtStore(
          ctx.orgId,
          data.storeId,
          line.catalogItemId,
        );
        return {
          catalogItemId: line.catalogItemId,
          quantity: line.quantity - currentBalance,
          countedQuantity: line.quantity,
        };
      }),
    );
  } else {
    linesCreateData = data.lines.map((line) => ({
      catalogItemId: line.catalogItemId,
      quantity: line.quantity,
    }));
  }

  const number = await nextMovementNumber(ctx.orgId);
  const movement = await prisma.stockMovement.create({
    data: {
      orgId: ctx.orgId,
      type,
      number,
      storeId: data.storeId,
      toStoreId: data.toStoreId ?? null,
      comment: data.comment,
      lines: { create: linesCreateData },
    },
  });

  revalidatePath(`/${orgSlug}/warehouse`);
  revalidatePath(`/${orgSlug}/warehouse/stock`);
  return { movementId: movement.id };
}

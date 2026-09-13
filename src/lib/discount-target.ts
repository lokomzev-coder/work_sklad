import { prisma } from "@/lib/prisma";

/**
 * `Discount.targetId` is deliberately not a real foreign key (it points at
 * one of three different tables depending on `target`) — see its schema
 * comment. With no DB constraint to catch a bogus or cross-org id, this
 * check is the only thing standing between "targetId" and garbage/another
 * org's data. Shared by the dashboard action (actions/discounts.ts) and the
 * public API's `discount` entity (lib/api-registry.ts) — found the hard way
 * that the API route's plain Zod validation alone let a nonexistent
 * `targetId` through as a 201.
 */
export async function assertDiscountTargetBelongsToOrg(
  orgId: string,
  target: string,
  targetId: string | null | undefined,
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!targetId) return { ok: true };
  if (target === "CATALOG_GROUP") {
    const group = await prisma.catalogGroup.findFirst({ where: { id: targetId, orgId } });
    if (!group) return { ok: false, error: "Группа товаров не найдена" };
  } else if (target === "CATALOG_ITEM") {
    const item = await prisma.catalogItem.findFirst({ where: { id: targetId, orgId } });
    if (!item) return { ok: false, error: "Товар не найден" };
  } else if (target === "CLIENT") {
    const client = await prisma.client.findFirst({ where: { id: targetId, orgId } });
    if (!client) return { ok: false, error: "Клиент не найден" };
  }
  return { ok: true };
}

import type { Prisma } from "@/generated/prisma/client";

/**
 * Block M1 — FIFO cost-batch tracking. Pure, transaction-scoped helpers
 * called from actions/fulfillment.ts (createSupply creates a batch per
 * receipt line, createDemand consumes them oldest-first). See
 * prisma/schema.prisma's StockBatch/StockBatchAllocation doc comments and
 * ROADMAP.md Block M/M1 for the design and its deliberate scope
 * boundaries (SUPPLY-only, not store-scoped, no retroactive backfill).
 */

type Tx = Prisma.TransactionClient;

export async function createBatchForSupplyLine(
  tx: Tx,
  params: {
    orgId: string;
    catalogItemId: string;
    sourceMovementLineId: string;
    unitCost: number;
    currency: string | null;
    // Block M2: rate to baseCurrency at receipt time — fixed for the
    // batch's whole lifetime, same as unitCost/currency.
    rateSnapshot: number | null;
    quantity: number;
  },
): Promise<void> {
  await tx.stockBatch.create({
    data: {
      orgId: params.orgId,
      catalogItemId: params.catalogItemId,
      sourceMovementLineId: params.sourceMovementLineId,
      unitCost: params.unitCost,
      currency: params.currency,
      rateSnapshot: params.rateSnapshot,
      initialQuantity: params.quantity,
      remainingQuantity: params.quantity,
    },
  });
}

export interface FifoAllocationResult {
  /** Quantity actually matched to a batch (has a known, exact cost). */
  allocated: number;
  /** Quantity that ran out of batches to draw from — no batches existed yet
   * for this item (pre-M1 stock, manual ENTER, or oversold beyond tracked
   * receipts). Caller (P&L) prices this portion via a fallback. */
  unallocated: number;
}

/**
 * Consumes `quantity` of `catalogItemId` from the oldest available batches
 * (org-wide, not store-scoped — see StockBatch's doc comment for why),
 * recording one StockBatchAllocation per batch drawn from. Never throws on
 * running out of batches — the system doesn't hard-enforce physical stock
 * non-negativity elsewhere either (createDemand only checks the order's
 * remaining quantity, not warehouse balance), so this just reports how much
 * it couldn't cost-match rather than blocking the sale.
 */
export async function allocateFifo(
  tx: Tx,
  params: {
    orgId: string;
    catalogItemId: string;
    demandLineId: string;
    quantity: number;
  },
): Promise<FifoAllocationResult> {
  let remaining = params.quantity;
  let allocated = 0;

  const batches = await tx.stockBatch.findMany({
    where: { orgId: params.orgId, catalogItemId: params.catalogItemId, remainingQuantity: { gt: 0 } },
    orderBy: { createdAt: "asc" },
  });

  for (const batch of batches) {
    if (remaining <= 0) break;
    const available = Number(batch.remainingQuantity);
    const take = Math.min(available, remaining);
    if (take <= 0) continue;

    await tx.stockBatch.update({
      where: { id: batch.id },
      data: { remainingQuantity: { decrement: take } },
    });
    await tx.stockBatchAllocation.create({
      data: {
        batchId: batch.id,
        demandLineId: params.demandLineId,
        quantity: take,
        unitCost: batch.unitCost,
        currency: batch.currency,
        rateSnapshot: batch.rateSnapshot,
      },
    });

    remaining -= take;
    allocated += take;
  }

  return { allocated, unallocated: remaining };
}

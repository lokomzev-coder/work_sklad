/**
 * Block W (explicit request, 2026-09-21) — one-time migration for the
 * INVENTORY ledger-semantics change: INVENTORY documents used to move stock
 * directly (their line `quantity` — a signed delta — was summed straight
 * into the balance, see lib/stock.ts's old comment). They no longer do.
 *
 * For every ALREADY-POSTED INVENTORY document that has no correction
 * documents yet, this generates the exact same ENTER (surplus) / LOSS
 * (shortage) pair that "Создать документ" would generate by hand — so the
 * org's total balance is unchanged by this migration, only how it's
 * recorded (a real ENTER/LOSS row instead of an implicit INVENTORY delta).
 *
 * Idempotent — skips any inventory that already has correctionDocuments
 * (from a real "Создать документ" click or a previous run of this script).
 * Safe to run more than once. Run manually:
 *
 *   npx tsx scripts/migrate-inventory-corrections.ts
 */
import "dotenv/config";

import { prisma } from "../src/lib/prisma";

async function nextMovementNumber(orgId: string): Promise<number> {
  const last = await prisma.stockMovement.findFirst({
    where: { orgId },
    orderBy: { number: "desc" },
    select: { number: true },
  });
  return (last?.number ?? 0) + 1;
}

async function main() {
  const inventories = await prisma.stockMovement.findMany({
    where: { type: "INVENTORY", isPosted: true, correctionDocuments: { none: {} } },
    include: { lines: true },
  });

  console.log(`Found ${inventories.length} posted inventory document(s) with no corrections yet.`);

  for (const inventory of inventories) {
    const surplusLines = inventory.lines.filter((l) => Number(l.quantity) > 0);
    const shortageLines = inventory.lines.filter((l) => Number(l.quantity) < 0);
    if (surplusLines.length === 0 && shortageLines.length === 0) {
      console.log(`  Inventory ${inventory.id} (№${inventory.number}): no discrepancies, nothing to migrate.`);
      continue;
    }

    if (surplusLines.length > 0) {
      const number = await nextMovementNumber(inventory.orgId);
      const created = await prisma.stockMovement.create({
        data: {
          orgId: inventory.orgId,
          type: "ENTER",
          number,
          storeId: inventory.storeId,
          comment: `Оприходование по итогам инвентаризации №${inventory.number} (миграция)`,
          sourceInventoryId: inventory.id,
          lines: {
            create: surplusLines.map((l) => ({
              catalogItemId: l.catalogItemId,
              variantId: l.variantId,
              quantity: l.quantity,
            })),
          },
        },
      });
      console.log(`  Inventory ${inventory.id} (№${inventory.number}): created ENTER №${number} (${created.id}).`);
    }

    if (shortageLines.length > 0) {
      const number = await nextMovementNumber(inventory.orgId);
      const created = await prisma.stockMovement.create({
        data: {
          orgId: inventory.orgId,
          type: "LOSS",
          number,
          storeId: inventory.storeId,
          comment: `Списание по итогам инвентаризации №${inventory.number} (миграция)`,
          sourceInventoryId: inventory.id,
          lines: {
            create: shortageLines.map((l) => ({
              catalogItemId: l.catalogItemId,
              variantId: l.variantId,
              quantity: -Number(l.quantity),
            })),
          },
        },
      });
      console.log(`  Inventory ${inventory.id} (№${inventory.number}): created LOSS №${number} (${created.id}).`);
    }
  }

  console.log("Done.");
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

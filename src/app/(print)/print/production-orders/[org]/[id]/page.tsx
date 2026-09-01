import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getOrgContext } from "@/lib/tenant";
import { can } from "@/lib/permissions";
import { isRowVisible } from "@/lib/scope";
import { PrintProductionDocument } from "@/components/print/print-production-document";

export default async function PrintProductionOrderPage({
  params,
}: {
  params: Promise<{ org: string; id: string }>;
}) {
  const { org, id } = await params;
  const ctx = await getOrgContext(org);
  if (!can(ctx, "productionOrders", "view")) notFound();

  const productionOrder = await prisma.productionOrder.findFirst({
    where: { id, orgId: ctx.orgId },
    include: {
      techCard: {
        include: {
          outputItem: { include: { unit: true } },
          components: { include: { catalogItem: { include: { unit: true } } } },
        },
      },
      materialsStore: true,
      productsStore: true,
      assignedEmployee: true,
      status: true,
    },
  });
  if (!productionOrder) notFound();
  if (!(await isRowVisible(ctx, "productionOrders", productionOrder.assignedEmployeeId))) notFound();

  const defaultLegalEntity = await prisma.legalEntity.findFirst({
    where: { orgId: ctx.orgId, isDefault: true, status: "ACTIVE" },
  });
  const issuer = defaultLegalEntity ?? { name: ctx.orgName, inn: null, kpp: null, ogrn: null, address: null };

  const completedQuantity = Number(productionOrder.completedQuantity);
  const isPosted = completedQuantity > 0;

  let consumedLines: { name: string; quantity: string; unit: string; price: string; sum: string }[];
  let outputLines: { name: string; quantity: string; unit: string; price: string; sum: string }[];
  let totalCost = 0;
  let currency = "RUB";

  if (isPosted) {
    const movements = await prisma.stockMovement.findMany({
      where: { productionOrderId: id },
      include: { lines: { include: { catalogItem: { include: { unit: true } } } } },
    });

    // Different partial completions can post the same catalogItemId at
    // different unitPriceSnapshot values (e.g. materials before/after a
    // purchase establishes cost history) — sum actual per-line cost rather
    // than multiplying total quantity by any single line's price, or the
    // total would misrepresent what was actually consumed/produced.
    const aggregate = (type: "PRODUCTION_CONSUME" | "PRODUCTION_OUTPUT") => {
      const byItem = new Map<
        string,
        { name: string; unit: string; quantity: number; totalSum: number; currency: string }
      >();
      for (const movement of movements) {
        if (movement.type !== type) continue;
        for (const line of movement.lines) {
          const quantity = Number(line.quantity);
          const price = Number(line.unitPriceSnapshot ?? 0);
          const existing = byItem.get(line.catalogItemId);
          if (existing) {
            existing.quantity += quantity;
            existing.totalSum += quantity * price;
          } else {
            byItem.set(line.catalogItemId, {
              name: line.catalogItem.name,
              unit: line.catalogItem.unit?.shortName ?? "—",
              quantity,
              totalSum: quantity * price,
              currency: line.currency ?? productionOrder.techCard.outputItem.currency,
            });
          }
        }
      }
      return [...byItem.values()].map((row) => ({
        name: row.name,
        quantity: String(row.quantity),
        unit: row.unit,
        // Weighted-average unit price across all postings, for display only
        // — the authoritative total is totalSum (below), not quantity×price.
        price: (row.quantity > 0 ? row.totalSum / row.quantity : 0).toFixed(2),
        sum: row.totalSum.toFixed(2),
        currency: row.currency,
      }));
    };

    const consumed = aggregate("PRODUCTION_CONSUME");
    const output = aggregate("PRODUCTION_OUTPUT");
    consumedLines = consumed;
    outputLines = output;
    totalCost = output.reduce((sum, r) => sum + Number(r.sum), 0);
    currency = output[0]?.currency ?? productionOrder.techCard.outputItem.currency;
  } else {
    const totalQuantity = Number(productionOrder.quantity);
    const ratio = totalQuantity / Number(productionOrder.techCard.outputQuantity);
    consumedLines = productionOrder.techCard.components.map((c) => ({
      name: c.catalogItem.name,
      quantity: String(Number(c.quantity) * ratio),
      unit: c.catalogItem.unit?.shortName ?? "—",
      price: "—",
      sum: "—",
    }));
    outputLines = [
      {
        name: productionOrder.techCard.outputItem.name,
        quantity: String(totalQuantity),
        unit: productionOrder.techCard.outputItem.unit?.shortName ?? "—",
        price: "—",
        sum: "—",
      },
    ];
    currency = productionOrder.techCard.outputItem.currency;
  }

  return (
    <PrintProductionDocument
      title={`Производственное задание №${productionOrder.number} от ${productionOrder.createdAt.toLocaleDateString("ru-RU")}`}
      issuer={{
        name: issuer.name,
        inn: issuer.inn,
        kpp: issuer.kpp,
        ogrn: issuer.ogrn,
        address: issuer.address,
      }}
      materialsStoreName={productionOrder.materialsStore.name}
      productsStoreName={productionOrder.productsStore.name}
      assignedEmployeeName={productionOrder.assignedEmployee?.fullName ?? null}
      statusName={productionOrder.status.name}
      progress={{ completed: String(completedQuantity), total: productionOrder.quantity.toString() }}
      consumedLines={consumedLines}
      outputLines={outputLines}
      totalCost={totalCost.toFixed(2)}
      currency={currency}
      isPosted={isPosted}
    />
  );
}

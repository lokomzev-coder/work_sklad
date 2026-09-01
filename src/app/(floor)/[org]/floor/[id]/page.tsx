import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getOrgContext } from "@/lib/tenant";
import { isRowVisible } from "@/lib/scope";
import { getStockBalances } from "@/lib/stock";
import { computeStageProgress } from "@/lib/production-stages";
import { ProductionOrderCompletePanel } from "@/components/production/production-order-complete-panel";
import { ProductionStagesPanel } from "@/components/production/production-stages-panel";
import { ProductionOrderHistory } from "@/components/production/production-order-history";

/**
 * Floor-worker view of a single production order — deliberately a stripped
 * copy of (dashboard)/[org]/production/[id]/page.tsx's data shaping (same
 * stageRows/flatComponents math), minus everything a shop-floor worker has
 * no business touching: editing the order (store/tech card/quantity),
 * changing its document status, and printing. Just "what do I make and how
 * much have I done".
 */
export default async function FloorOrderDetailPage({
  params,
}: {
  params: Promise<{ org: string; id: string }>;
}) {
  const { org, id } = await params;
  const ctx = await getOrgContext(org);

  const productionOrder = await prisma.productionOrder.findFirst({
    where: { id, orgId: ctx.orgId },
    include: {
      techCard: {
        include: {
          outputItem: true,
          components: { include: { catalogItem: true } },
          techProcess: true,
        },
      },
      materialsStore: true,
      productsStore: true,
      assignedEmployee: true,
      status: true,
    },
  });
  if (!productionOrder) notFound();
  if (!(await isRowVisible(ctx, "productionOrders", productionOrder.assignedEmployeeId))) {
    notFound();
  }

  const isStaged = !!productionOrder.techCard.techProcessId;

  const [materialsBalances, movements, stages] = await Promise.all([
    getStockBalances(ctx.orgId, { storeId: productionOrder.materialsStoreId }),
    prisma.stockMovement.findMany({
      where: { productionOrderId: productionOrder.id },
      include: { lines: { include: { catalogItem: true } } },
      orderBy: { createdAt: "asc" },
    }),
    isStaged
      ? prisma.productionStage.findMany({
          where: { productionOrderId: productionOrder.id },
          include: { techProcessPosition: { include: { processingStage: true } } },
          orderBy: { position: "asc" },
        })
      : Promise.resolve([]),
  ]);

  const balanceByItem = new Map(materialsBalances.map((b) => [b.catalogItemId, Number(b.quantity)]));
  const outputQuantity = Number(productionOrder.techCard.outputQuantity);
  const completedQuantity = Number(productionOrder.completedQuantity);

  const stageRows = stages.map((stage) => {
    const stagePosition = stage.position;
    const preceding = stages.find((s) => s.position === stagePosition - 1) ?? null;
    const maxPosition = Math.max(...stages.map((s) => s.position));
    const progress = computeStageProgress(
      { totalQuantity: Number(stage.totalQuantity), completedQuantity: Number(stage.completedQuantity), position: stagePosition },
      preceding ? { completedQuantity: Number(preceding.completedQuantity) } : null,
      maxPosition,
    );
    const materials = productionOrder.techCard.components
      .filter(
        (c) =>
          c.techProcessPositionId === stage.techProcessPositionId ||
          (c.techProcessPositionId === null && stagePosition === 0),
      )
      .map((c) => ({
        catalogItemId: c.catalogItemId,
        name: c.catalogItem.name,
        neededPerUnit: Number(c.quantity) / outputQuantity,
        available: balanceByItem.get(c.catalogItemId) ?? 0,
      }));
    return {
      id: stage.id,
      stageName: stage.techProcessPosition.processingStage.name,
      position: stagePosition,
      totalQuantity: progress.totalQuantity,
      completedQuantity: progress.completedQuantity,
      availableQuantity: progress.availableQuantity,
      blockedQuantity: progress.blockedQuantity,
      isLast: progress.isLast,
      materials,
    };
  });

  const flatComponents = productionOrder.techCard.components.map((c) => ({
    catalogItemId: c.catalogItemId,
    name: c.catalogItem.name,
    neededPerUnit: Number(c.quantity) / outputQuantity,
    available: balanceByItem.get(c.catalogItemId) ?? 0,
  }));

  return (
    <div className="flex max-w-2xl flex-col gap-4">
      <div>
        <h1 className="text-2xl font-semibold">Задание №{productionOrder.number}</h1>
        <p className="text-sm text-muted-foreground">
          {productionOrder.techCard.name} · {productionOrder.status.name}
        </p>
      </div>

      <div className="rounded-md border p-4 text-sm">
        <p>Склад материалов: {productionOrder.materialsStore.name}</p>
        <p>Склад продукции: {productionOrder.productsStore.name}</p>
        <p>Количество: {productionOrder.quantity.toString()}</p>
      </div>

      {isStaged ? (
        <ProductionStagesPanel
          orgSlug={org}
          outputName={productionOrder.techCard.outputItem.name}
          stages={stageRows}
          orderCompletedAt={productionOrder.completedAt ? productionOrder.completedAt.toISOString() : null}
        />
      ) : (
        <ProductionOrderCompletePanel
          orgSlug={org}
          productionOrderId={productionOrder.id}
          outputName={productionOrder.techCard.outputItem.name}
          totalQuantity={Number(productionOrder.quantity)}
          completedQuantity={completedQuantity}
          components={flatComponents}
          completedAt={productionOrder.completedAt ? productionOrder.completedAt.toISOString() : null}
        />
      )}

      {movements.length > 0 && <ProductionOrderHistory movements={movements} />}
    </div>
  );
}

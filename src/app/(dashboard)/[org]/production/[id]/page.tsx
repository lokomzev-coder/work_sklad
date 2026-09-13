import { notFound } from "next/navigation";
import { prisma, withDbRetry } from "@/lib/prisma";
import { getOrgContext } from "@/lib/tenant";
import { can } from "@/lib/permissions";
import { isRowVisible } from "@/lib/scope";
import { getSelectableStatuses } from "@/lib/document-statuses";
import { getStockBalances } from "@/lib/stock";
import { computeStageProgress } from "@/lib/production-stages";
import { listCustomFieldDefinitions, getCustomFieldValues } from "@/lib/custom-fields";
import { ProductionOrderForm } from "@/components/production/production-order-form";
import { ProductionOrderStatusSelect } from "@/components/production/production-order-status-select";
import { ProductionOrderCompletePanel } from "@/components/production/production-order-complete-panel";
import { ProductionStagesPanel } from "@/components/production/production-stages-panel";
import { ProductionOrderHistory } from "@/components/production/production-order-history";
import { PrintDialog } from "@/components/print/print-dialog";
import { getComments } from "@/lib/comments";
import { EventFeed } from "@/components/comments/event-feed";
import { listAttachments } from "@/lib/attachments";
import { AttachmentList } from "@/components/attachments/attachment-list";

export default async function ProductionOrderDetailPage({
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
          outputItem: true,
          components: { include: { catalogItem: true } },
          techProcess: true,
        },
      },
      materialsStore: true,
      productsStore: true,
      assignedEmployee: true,
    },
  });
  if (!productionOrder) notFound();
  if (!(await isRowVisible(ctx, "productionOrders", productionOrder.assignedEmployeeId))) {
    notFound();
  }

  const comments = await getComments(ctx.orgId, "ProductionOrder", productionOrder.id, ctx.employeeId);
  const attachments = await listAttachments(ctx.orgId, "ProductionOrder", productionOrder.id);

  const isStaged = !!productionOrder.techCard.techProcessId;

  // Block: split into two smaller sequential batches (was one 9-wide
  // Promise.all) — same fix as orders/[id]/page.tsx, see its comment for
  // why. withDbRetry on each half — safe, every query is read-only.
  const [techCards, stores, employees, statusOptions, materialsBalances] = await withDbRetry(() =>
    Promise.all([
      prisma.techCard.findMany({
        where: { orgId: ctx.orgId, status: "ACTIVE" },
        include: { outputItem: true },
        orderBy: { name: "asc" },
      }),
      prisma.store.findMany({ where: { orgId: ctx.orgId, status: "ACTIVE" }, orderBy: { name: "asc" } }),
      prisma.employee.findMany({ where: { orgId: ctx.orgId, status: "ACTIVE" }, orderBy: { fullName: "asc" } }),
      getSelectableStatuses(ctx.orgId, "PRODUCTION_ORDER", productionOrder.statusId, {
        role: ctx.role,
        customRoleId: ctx.customRoleId,
        employeeId: ctx.employeeId,
      }),
      getStockBalances(ctx.orgId, { storeId: productionOrder.materialsStoreId }),
    ]),
  );

  const [customFieldDefs, customFieldValues, movements, stages] = await withDbRetry(() =>
    Promise.all([
      listCustomFieldDefinitions(ctx.orgId, "PRODUCTION_ORDER"),
      getCustomFieldValues(productionOrder.id),
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
    ]),
  );

  const balanceByItem = new Map(materialsBalances.map((b) => [b.catalogItemId, Number(b.quantity)]));
  const outputQuantity = Number(productionOrder.techCard.outputQuantity);

  const completedQuantity = Number(productionOrder.completedQuantity);
  const isFullyCompleted = !!productionOrder.completedAt;
  const isInProgress = !isFullyCompleted && (isStaged ? stages.some((s) => Number(s.completedQuantity) > 0) : completedQuantity > 0);

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
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Задание №{productionOrder.number}</h1>
        <div className="flex items-center gap-2">
          <PrintDialog
            documentType="productionOrder"
            orgSlug={org}
            documentId={productionOrder.id}
            openPdfInBrowser={ctx.openPdfInBrowser}
          />
          <ProductionOrderStatusSelect
            orgSlug={org}
            productionOrderId={productionOrder.id}
            statusId={productionOrder.statusId}
            statusOptions={statusOptions}
          />
        </div>
      </div>

      {isFullyCompleted ? (
        <div className="rounded-md border p-4 text-sm">
          <p>Техкарта: {productionOrder.techCard.name}</p>
          <p>Склад материалов: {productionOrder.materialsStore.name}</p>
          <p>Склад продукции: {productionOrder.productsStore.name}</p>
          <p>Количество: {productionOrder.quantity.toString()}</p>
          <p>Сотрудник: {productionOrder.assignedEmployee?.fullName ?? "—"}</p>
          {customFieldDefs.map((def) => (
            <p key={def.id}>
              {def.name}: {customFieldValues[def.id] || "—"}
            </p>
          ))}
        </div>
      ) : (
        <ProductionOrderForm
          orgSlug={org}
          productionOrderId={productionOrder.id}
          techCardOptions={techCards.map((t) => ({ value: t.id, label: `${t.name} → ${t.outputItem.name}` }))}
          storeOptions={stores.map((s) => ({ value: s.id, label: s.name }))}
          employeeOptions={employees.map((e) => ({ value: e.id, label: e.fullName }))}
          locked={isInProgress}
          customFieldDefs={customFieldDefs}
          defaultValues={{
            techCardId: productionOrder.techCardId,
            materialsStoreId: productionOrder.materialsStoreId,
            productsStoreId: productionOrder.productsStoreId,
            quantity: productionOrder.quantity.toString(),
            assignedEmployeeId: productionOrder.assignedEmployeeId,
            customFieldValues,
          }}
        />
      )}

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
      <AttachmentList
        orgSlug={org}
        entityType="ProductionOrder"
        entityId={productionOrder.id}
        revalidateHref={`/${org}/production/${productionOrder.id}`}
        attachments={attachments}
      />
      <EventFeed
        orgSlug={org}
        entityType="ProductionOrder"
        entityId={productionOrder.id}
        revalidateHref={`/${org}/production/${productionOrder.id}`}
        comments={comments}
      />
    </div>
  );
}

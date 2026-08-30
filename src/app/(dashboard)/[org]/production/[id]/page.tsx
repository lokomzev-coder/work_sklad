import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getOrgContext } from "@/lib/tenant";
import { getSelectableStatuses } from "@/lib/document-statuses";
import { getStockBalances } from "@/lib/stock";
import { ProductionOrderForm } from "@/components/production/production-order-form";
import { ProductionOrderStatusSelect } from "@/components/production/production-order-status-select";
import { ProductionOrderCompletePanel } from "@/components/production/production-order-complete-panel";

export default async function ProductionOrderDetailPage({
  params,
}: {
  params: Promise<{ org: string; id: string }>;
}) {
  const { org, id } = await params;
  const ctx = await getOrgContext(org);

  const productionOrder = await prisma.productionOrder.findFirst({
    where: { id, orgId: ctx.orgId },
    include: {
      techCard: { include: { outputItem: true, components: { include: { catalogItem: true } } } },
      store: true,
      assignedEmployee: true,
    },
  });
  if (!productionOrder) notFound();

  const [techCards, stores, employees, statusOptions, balances] = await Promise.all([
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
    getStockBalances(ctx.orgId, { storeId: productionOrder.storeId }),
  ]);

  const balanceByItem = new Map(balances.map((b) => [b.catalogItemId, Number(b.quantity)]));
  const ratio = Number(productionOrder.quantity) / Number(productionOrder.techCard.outputQuantity);
  const materials = productionOrder.techCard.components.map((c) => ({
    catalogItemId: c.catalogItemId,
    name: c.catalogItem.name,
    needed: Number(c.quantity) * ratio,
    available: balanceByItem.get(c.catalogItemId) ?? 0,
  }));

  return (
    <div className="flex max-w-2xl flex-col gap-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Задание №{productionOrder.number}</h1>
        <ProductionOrderStatusSelect
          orgSlug={org}
          productionOrderId={productionOrder.id}
          statusId={productionOrder.statusId}
          statusOptions={statusOptions}
        />
      </div>

      {productionOrder.completedAt ? (
        <div className="rounded-md border p-4 text-sm">
          <p>Техкарта: {productionOrder.techCard.name}</p>
          <p>Склад: {productionOrder.store.name}</p>
          <p>Количество: {productionOrder.quantity.toString()}</p>
          <p>Сотрудник: {productionOrder.assignedEmployee?.fullName ?? "—"}</p>
        </div>
      ) : (
        <ProductionOrderForm
          orgSlug={org}
          productionOrderId={productionOrder.id}
          techCardOptions={techCards.map((t) => ({ value: t.id, label: `${t.name} → ${t.outputItem.name}` }))}
          storeOptions={stores.map((s) => ({ value: s.id, label: s.name }))}
          employeeOptions={employees.map((e) => ({ value: e.id, label: e.fullName }))}
          defaultValues={{
            techCardId: productionOrder.techCardId,
            storeId: productionOrder.storeId,
            quantity: productionOrder.quantity.toString(),
            assignedEmployeeId: productionOrder.assignedEmployeeId,
          }}
        />
      )}

      <ProductionOrderCompletePanel
        orgSlug={org}
        productionOrderId={productionOrder.id}
        outputName={productionOrder.techCard.outputItem.name}
        outputQuantity={Number(productionOrder.quantity)}
        materials={materials}
        completedAt={productionOrder.completedAt ? productionOrder.completedAt.toISOString() : null}
      />
    </div>
  );
}

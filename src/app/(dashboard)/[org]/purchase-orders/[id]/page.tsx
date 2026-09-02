import { notFound } from "next/navigation";
import { prisma, withDbRetry } from "@/lib/prisma";
import { getOrgContext } from "@/lib/tenant";
import { can } from "@/lib/permissions";
import { isRowVisible } from "@/lib/scope";
import { PurchaseOrderForm } from "@/components/purchase-orders/purchase-order-form";
import { PurchaseOrderStatusSelect } from "@/components/purchase-orders/purchase-order-status-select";
import { FulfillmentPanel } from "@/components/fulfillment/fulfillment-panel";
import { PrintDialog } from "@/components/print/print-dialog";
import { Button } from "@/components/ui/button";
import { createInvoiceFromPurchaseOrder } from "@/actions/invoices-in";
import { getSelectableStatuses } from "@/lib/document-statuses";
import { listCustomFieldDefinitions, getCustomFieldValues } from "@/lib/custom-fields";

export default async function EditPurchaseOrderPage({
  params,
}: {
  params: Promise<{ org: string; id: string }>;
}) {
  const { org, id } = await params;
  const ctx = await getOrgContext(org);
  if (!can(ctx, "purchaseOrders", "view")) notFound();

  const purchaseOrder = await prisma.purchaseOrder.findFirst({
    where: { id, orgId: ctx.orgId },
    include: { lineItems: true },
  });

  if (!purchaseOrder) {
    notFound();
  }
  if (!(await isRowVisible(ctx, "purchaseOrders", purchaseOrder.assignedEmployeeId))) {
    notFound();
  }

  const referencedCatalogItemIds = purchaseOrder.lineItems.map((li) => li.catalogItemId);

  // Block: split into two smaller sequential batches (was one 11-wide
  // Promise.all) — same fix as orders/[id]/page.tsx, see its comment for why
  // (local `prisma dev` proxy chokes on too many simultaneous new
  // connections). withDbRetry on each half — safe, every query is read-only.
  const [activeSuppliers, activeEmployees, activeCatalogItems, referencedSupplier, referencedEmployee, referencedCatalogItems] =
    await withDbRetry(() =>
      Promise.all([
        prisma.client.findMany({ where: { orgId: ctx.orgId, status: "ACTIVE" }, orderBy: { name: "asc" } }),
        prisma.employee.findMany({ where: { orgId: ctx.orgId, status: "ACTIVE" }, orderBy: { fullName: "asc" } }),
        prisma.catalogItem.findMany({ where: { orgId: ctx.orgId, status: "ACTIVE" }, orderBy: { name: "asc" } }),
        purchaseOrder.supplierId
          ? prisma.client.findUnique({ where: { id: purchaseOrder.supplierId } })
          : null,
        purchaseOrder.assignedEmployeeId
          ? prisma.employee.findUnique({ where: { id: purchaseOrder.assignedEmployeeId } })
          : null,
        prisma.catalogItem.findMany({ where: { id: { in: referencedCatalogItemIds } } }),
      ]),
    );

  const [contracts, legalEntities, statusOptions, customFieldDefs, customFieldValues] = await withDbRetry(() =>
    Promise.all([
      prisma.contract.findMany({ where: { orgId: ctx.orgId }, orderBy: { number: "asc" } }),
      prisma.legalEntity.findMany({ where: { orgId: ctx.orgId, status: "ACTIVE" }, orderBy: { name: "asc" } }),
      getSelectableStatuses(ctx.orgId, "PURCHASE_ORDER", purchaseOrder.statusId, {
        role: ctx.role,
        customRoleId: ctx.customRoleId,
        employeeId: ctx.employeeId,
      }),
      listCustomFieldDefinitions(ctx.orgId, "PURCHASE_ORDER"),
      getCustomFieldValues(purchaseOrder.id),
    ]),
  );

  const suppliers = referencedSupplier
    ? [referencedSupplier, ...activeSuppliers.filter((c) => c.id !== referencedSupplier.id)]
    : activeSuppliers;
  const employees = referencedEmployee
    ? [referencedEmployee, ...activeEmployees.filter((e) => e.id !== referencedEmployee.id)]
    : activeEmployees;
  const catalogItemsById = new Map(
    [...activeCatalogItems, ...referencedCatalogItems].map((c) => [c.id, c]),
  );
  const catalogItems = [...catalogItemsById.values()];

  const [stores, supplies, purchaseReturns] = await Promise.all([
    prisma.store.findMany({ where: { orgId: ctx.orgId, status: "ACTIVE" }, orderBy: { name: "asc" } }),
    prisma.stockMovement.findMany({
      where: { purchaseOrderId: purchaseOrder.id, type: "SUPPLY" },
      include: { store: true, lines: true },
      orderBy: { number: "asc" },
    }),
    prisma.stockMovement.findMany({
      where: { purchaseOrderId: purchaseOrder.id, type: "PURCHASE_RETURN" },
      include: { store: true, lines: true },
      orderBy: { number: "asc" },
    }),
  ]);

  const receivedByItem = new Map<string, number>();
  for (const supply of supplies) {
    for (const line of supply.lines) {
      receivedByItem.set(
        line.catalogItemId,
        (receivedByItem.get(line.catalogItemId) ?? 0) + Number(line.quantity),
      );
    }
  }
  const returnedByItem = new Map<string, number>();
  for (const ret of purchaseReturns) {
    for (const line of ret.lines) {
      returnedByItem.set(
        line.catalogItemId,
        (returnedByItem.get(line.catalogItemId) ?? 0) + Number(line.quantity),
      );
    }
  }

  return (
    <div className="flex max-w-2xl flex-col gap-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Заказ поставщику №{purchaseOrder.number}</h1>
        <div className="flex items-center gap-2">
          {can(ctx, "invoicesIn", "create") && (
            <form action={createInvoiceFromPurchaseOrder.bind(null, org, purchaseOrder.id)}>
              <Button type="submit" variant="outline" size="sm">
                Создать счёт
              </Button>
            </form>
          )}
          <PrintDialog
            documentType="purchaseOrder"
            orgSlug={org}
            documentId={purchaseOrder.id}
            legalEntities={legalEntities.map((e) => ({ id: e.id, name: e.name }))}
            currentLegalEntityId={purchaseOrder.legalEntityId}
          />
          <PurchaseOrderStatusSelect
            orgSlug={org}
            purchaseOrderId={purchaseOrder.id}
            statusId={purchaseOrder.statusId}
            statusOptions={statusOptions}
          />
        </div>
      </div>
      <PurchaseOrderForm
        orgSlug={org}
        purchaseOrderId={purchaseOrder.id}
        supplierOptions={suppliers.map((c) => ({ value: c.id, label: c.name }))}
        employeeOptions={employees.map((e) => ({ value: e.id, label: e.fullName }))}
        catalogOptions={catalogItems.map((c) => ({
          id: c.id,
          name: c.name,
          unitPrice: c.unitPrice.toString(),
          currency: c.currency,
        }))}
        contractOptions={contracts.map((c) => ({ value: c.id, label: `№${c.number}` }))}
        legalEntityOptions={legalEntities.map((e) => ({ value: e.id, label: e.name }))}
        customFieldDefs={customFieldDefs}
        defaultValues={{
          supplierId: purchaseOrder.supplierId,
          assignedEmployeeId: purchaseOrder.assignedEmployeeId,
          contractId: purchaseOrder.contractId,
          legalEntityId: purchaseOrder.legalEntityId,
          lineItems: purchaseOrder.lineItems.map((li) => ({
            catalogItemId: li.catalogItemId,
            quantity: li.quantity.toString(),
            unitCost: li.unitPriceSnapshot.toString(),
          })),
          customFieldValues,
        }}
      />
      <FulfillmentPanel
        orgSlug={org}
        kind="supply"
        parentId={purchaseOrder.id}
        storeOptions={stores.map((s) => ({ value: s.id, label: s.name }))}
        defaultStoreId={ctx.defaultStoreId}
        lines={purchaseOrder.lineItems
          .filter((li) => catalogItemsById.get(li.catalogItemId)?.type === "PRODUCT")
          .map((li) => ({
            catalogItemId: li.catalogItemId,
            name: catalogItemsById.get(li.catalogItemId)?.name ?? "—",
            ordered: Number(li.quantity),
            fulfilled: receivedByItem.get(li.catalogItemId) ?? 0,
          }))}
        history={supplies.map((s) => ({
          id: s.id,
          number: s.number,
          storeName: s.store.name,
          createdAt: s.createdAt.toLocaleDateString("ru-RU"),
        }))}
      />
      {supplies.length > 0 && (
      <FulfillmentPanel
        orgSlug={org}
        kind="purchaseReturn"
        parentId={purchaseOrder.id}
        storeOptions={stores.map((s) => ({ value: s.id, label: s.name }))}
        defaultStoreId={ctx.defaultStoreId}
        lines={[...receivedByItem.keys()].map((catalogItemId) => ({
          catalogItemId,
          name: catalogItemsById.get(catalogItemId)?.name ?? "—",
          ordered: receivedByItem.get(catalogItemId) ?? 0,
          fulfilled: returnedByItem.get(catalogItemId) ?? 0,
        }))}
        history={purchaseReturns.map((r) => ({
          id: r.id,
          number: r.number,
          storeName: r.store.name,
          createdAt: r.createdAt.toLocaleDateString("ru-RU"),
        }))}
      />
      )}
    </div>
  );
}

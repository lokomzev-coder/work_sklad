import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getOrgContext } from "@/lib/tenant";
import { OrderForm } from "@/components/orders/order-form";
import { OrderStatusSelect } from "@/components/orders/order-status-select";
import { FulfillmentPanel } from "@/components/fulfillment/fulfillment-panel";
import { PrintButton } from "@/components/print/print-button";
import { variantLabel } from "@/lib/catalog-variants";
import { listDocumentStatuses } from "@/lib/document-statuses";

export default async function EditOrderPage({
  params,
}: {
  params: Promise<{ org: string; id: string }>;
}) {
  const { org, id } = await params;
  const ctx = await getOrgContext(org);

  const order = await prisma.order.findFirst({
    where: { id, orgId: ctx.orgId },
    include: { lineItems: true },
  });

  if (!order) {
    notFound();
  }
  if (ctx.orderScope === "OWN" && order.assignedEmployeeId !== ctx.employeeId) {
    notFound();
  }

  const referencedCatalogItemIds = order.lineItems.map((li) => li.catalogItemId);

  const variantInclude = {
    variants: {
      where: { status: "ACTIVE" as const },
      include: { values: { include: { characteristic: true } } },
    },
  };

  const [
    activeClients,
    activeEmployees,
    activeCatalogItems,
    referencedClient,
    referencedEmployee,
    referencedCatalogItems,
    contracts,
    salesChannels,
    legalEntities,
    statusOptions,
  ] = await Promise.all([
    prisma.client.findMany({
      where: { orgId: ctx.orgId, status: "ACTIVE" },
      orderBy: { name: "asc" },
    }),
    prisma.employee.findMany({
      where: { orgId: ctx.orgId, status: "ACTIVE" },
      orderBy: { fullName: "asc" },
    }),
    prisma.catalogItem.findMany({
      where: { orgId: ctx.orgId, status: "ACTIVE" },
      orderBy: { name: "asc" },
      include: variantInclude,
    }),
    order.clientId
      ? prisma.client.findUnique({ where: { id: order.clientId } })
      : null,
    order.assignedEmployeeId
      ? prisma.employee.findUnique({ where: { id: order.assignedEmployeeId } })
      : null,
    prisma.catalogItem.findMany({
      where: { id: { in: referencedCatalogItemIds } },
      include: variantInclude,
    }),
    prisma.contract.findMany({ where: { orgId: ctx.orgId }, orderBy: { number: "asc" } }),
    prisma.salesChannel.findMany({ where: { orgId: ctx.orgId }, orderBy: { name: "asc" } }),
    prisma.legalEntity.findMany({ where: { orgId: ctx.orgId, status: "ACTIVE" }, orderBy: { name: "asc" } }),
    listDocumentStatuses(ctx.orgId, "ORDER"),
  ]);

  // Archived entities stay out of the "pick something new" list, but an
  // already-referenced archived entity must still render (its FK is valid).
  const clients = referencedClient
    ? [referencedClient, ...activeClients.filter((c) => c.id !== referencedClient.id)]
    : activeClients;
  const employees = referencedEmployee
    ? [referencedEmployee, ...activeEmployees.filter((e) => e.id !== referencedEmployee.id)]
    : activeEmployees;
  const catalogItemsById = new Map(
    [...activeCatalogItems, ...referencedCatalogItems].map((c) => [c.id, c]),
  );
  const catalogItems = [...catalogItemsById.values()];

  const [stores, demands, salesReturns] = await Promise.all([
    prisma.store.findMany({ where: { orgId: ctx.orgId, status: "ACTIVE" }, orderBy: { name: "asc" } }),
    prisma.stockMovement.findMany({
      where: { orderId: order.id, type: "DEMAND" },
      include: { store: true, lines: true },
      orderBy: { number: "asc" },
    }),
    prisma.stockMovement.findMany({
      where: { orderId: order.id, type: "SALES_RETURN" },
      include: { store: true, lines: true },
      orderBy: { number: "asc" },
    }),
  ]);

  const shippedByItem = new Map<string, number>();
  for (const demand of demands) {
    for (const line of demand.lines) {
      shippedByItem.set(
        line.catalogItemId,
        (shippedByItem.get(line.catalogItemId) ?? 0) + Number(line.quantity),
      );
    }
  }
  const returnedByItem = new Map<string, number>();
  for (const ret of salesReturns) {
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
        <h1 className="text-2xl font-semibold">Заказ №{order.number}</h1>
        <div className="flex items-center gap-2">
          <PrintButton href={`/print/orders/${org}/${order.id}`} />
          <OrderStatusSelect
            orgSlug={org}
            orderId={order.id}
            statusId={order.statusId}
            statusOptions={statusOptions}
          />
        </div>
      </div>
      <OrderForm
        orgSlug={org}
        orderId={order.id}
        clientOptions={clients.map((c) => ({ value: c.id, label: c.name }))}
        employeeOptions={employees.map((e) => ({
          value: e.id,
          label: e.fullName,
        }))}
        catalogOptions={catalogItems.map((c) => ({
          id: c.id,
          name: c.name,
          unitPrice: c.unitPrice.toString(),
          currency: c.currency,
          variants: c.variants.map((v) => ({
            id: v.id,
            label: variantLabel(v.values) || (v.sku ?? v.id),
            price: v.priceOverride?.toString() ?? null,
          })),
        }))}
        contractOptions={contracts.map((c) => ({ value: c.id, label: `№${c.number}` }))}
        salesChannelOptions={salesChannels.map((c) => ({ value: c.id, label: c.name }))}
        legalEntityOptions={legalEntities.map((e) => ({ value: e.id, label: e.name }))}
        defaultValues={{
          clientId: order.clientId,
          assignedEmployeeId: order.assignedEmployeeId,
          contractId: order.contractId,
          salesChannelId: order.salesChannelId,
          legalEntityId: order.legalEntityId,
          lineItems: order.lineItems.map((li) => ({
            catalogItemId: li.catalogItemId,
            variantId: li.variantId,
            quantity: li.quantity.toString(),
          })),
        }}
      />
      <FulfillmentPanel
        orgSlug={org}
        kind="demand"
        parentId={order.id}
        storeOptions={stores.map((s) => ({ value: s.id, label: s.name }))}
        lines={order.lineItems
          .filter((li) => catalogItemsById.get(li.catalogItemId)?.type === "PRODUCT")
          .map((li) => ({
            catalogItemId: li.catalogItemId,
            name: catalogItemsById.get(li.catalogItemId)?.name ?? "—",
            ordered: Number(li.quantity),
            fulfilled: shippedByItem.get(li.catalogItemId) ?? 0,
          }))}
        history={demands.map((d) => ({
          id: d.id,
          number: d.number,
          storeName: d.store.name,
          createdAt: d.createdAt.toLocaleDateString("ru-RU"),
        }))}
      />
      {demands.length > 0 && (
      <FulfillmentPanel
        orgSlug={org}
        kind="salesReturn"
        parentId={order.id}
        storeOptions={stores.map((s) => ({ value: s.id, label: s.name }))}
        lines={[...shippedByItem.keys()].map((catalogItemId) => ({
          catalogItemId,
          name: catalogItemsById.get(catalogItemId)?.name ?? "—",
          ordered: shippedByItem.get(catalogItemId) ?? 0,
          fulfilled: returnedByItem.get(catalogItemId) ?? 0,
        }))}
        history={salesReturns.map((r) => ({
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

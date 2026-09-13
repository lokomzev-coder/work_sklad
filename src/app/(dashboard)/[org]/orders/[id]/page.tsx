import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma, withDbRetry } from "@/lib/prisma";
import { getOrgContext } from "@/lib/tenant";
import { can } from "@/lib/permissions";
import { isRowVisible } from "@/lib/scope";
import { OrderForm } from "@/components/orders/order-form";
import { OrderStatusSelect } from "@/components/orders/order-status-select";
import { FulfillmentPanel } from "@/components/fulfillment/fulfillment-panel";
import { CreateDocumentMenu } from "@/components/orders/create-document-menu";
import { PrintDialog } from "@/components/print/print-dialog";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "@/components/ui/table";
import { variantLabel } from "@/lib/catalog-variants";
import { getSelectableStatuses } from "@/lib/document-statuses";
import { listCustomFieldDefinitions, getCustomFieldValues } from "@/lib/custom-fields";
import { computeOrderPaymentStatus } from "@/lib/orders";
import { Badge } from "@/components/ui/badge";
import { formatMoney } from "@/lib/format";
import { getComments } from "@/lib/comments";
import { EventFeed } from "@/components/comments/event-feed";
import { listAttachments } from "@/lib/attachments";
import { AttachmentList } from "@/components/attachments/attachment-list";

// Block M6: composite key for grouping by (item, variant) — see
// actions/fulfillment.ts's lineKey for the same idiom used server-side.
function lineKey(catalogItemId: string, variantId: string | null): string {
  return `${catalogItemId}:${variantId ?? ""}`;
}

export default async function EditOrderPage({
  params,
}: {
  params: Promise<{ org: string; id: string }>;
}) {
  const { org, id } = await params;
  const ctx = await getOrgContext(org);
  if (!can(ctx, "orders", "view")) notFound();

  const order = await prisma.order.findFirst({
    where: { id, orgId: ctx.orgId },
    include: { lineItems: true },
  });

  if (!order) {
    notFound();
  }
  if (!(await isRowVisible(ctx, "orders", order.assignedEmployeeId))) {
    notFound();
  }

  const referencedCatalogItemIds = order.lineItems.map((li) => li.catalogItemId);

  const variantInclude = {
    variants: {
      where: { status: "ACTIVE" as const },
      include: { values: { include: { characteristic: true } } },
    },
  };

  // Block: split into two smaller sequential batches (was one 12-wide
  // Promise.all) — the local `prisma dev` proxy chokes when too many brand-
  // new connections open in the same instant ("Server has closed the
  // connection", reproducible even on an immediate retry of the same-size
  // burst; see lib/prisma.ts). This is the single most-visited page shape
  // in the app (every order view), so it's an even bigger real-world risk
  // than the dashboard was. withDbRetry on each half as a second layer —
  // safe, every query here is read-only.
  const [activeClients, activeEmployees, activeCatalogItems, referencedClient, referencedEmployee, referencedCatalogItems] =
    await withDbRetry(() =>
      Promise.all([
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
      ]),
    );

  const [contracts, salesChannels, legalEntities, statusOptions, customFieldDefs, customFieldValues] =
    await withDbRetry(() =>
      Promise.all([
        prisma.contract.findMany({ where: { orgId: ctx.orgId }, orderBy: { number: "asc" } }),
        prisma.salesChannel.findMany({ where: { orgId: ctx.orgId }, orderBy: { name: "asc" } }),
        prisma.legalEntity.findMany({ where: { orgId: ctx.orgId, status: "ACTIVE" }, orderBy: { name: "asc" } }),
        getSelectableStatuses(ctx.orgId, "ORDER", order.statusId, {
          role: ctx.role,
          customRoleId: ctx.customRoleId,
          employeeId: ctx.employeeId,
        }),
        listCustomFieldDefinitions(ctx.orgId, "ORDER"),
        getCustomFieldValues(order.id),
      ]),
    );

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
  // Archived variants referenced by an existing line item may not appear
  // here (variantInclude only pulls ACTIVE ones) — falls back to null label,
  // same tolerance as catalogItemsById's own "—" fallbacks elsewhere on this
  // page.
  const variantLabelById = new Map<string, string>();
  for (const item of catalogItems) {
    for (const v of item.variants) {
      variantLabelById.set(v.id, variantLabel(v.values) || (v.sku ?? v.id));
    }
  }

  // Order redesign added projects/paymentStatus to what was a 3-query
  // Promise.all — wrapped in withDbRetry (wasn't before) for the same
  // connection-burst reason as the two batches above.
  const [stores, projects, demands, salesReturns, paymentStatus, comments] = await withDbRetry(() =>
    Promise.all([
      prisma.store.findMany({ where: { orgId: ctx.orgId, status: "ACTIVE" }, orderBy: { name: "asc" } }),
      prisma.project.findMany({ where: { orgId: ctx.orgId, status: "ACTIVE" }, orderBy: { name: "asc" } }),
      // "Создать документ" flow: unfiltered on purpose — drafts must still
      // show up in the "Отгрузки по заказу" list below (so a cashier can
      // find their way back to an unfinished draft), just badged
      // differently. `postedDemands` (derived below) is the posted-only
      // view used for the remaining-to-ship math.
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
      computeOrderPaymentStatus(order.id),
      getComments(ctx.orgId, "Order", order.id, ctx.employeeId),
    ]),
  );
  const postedDemands = demands.filter((d) => d.isPosted);
  const attachments = await listAttachments(ctx.orgId, "Order", order.id);

  // Block M6: composite-keyed by (item, variant) so two line items of the
  // same item but different variants don't collapse into one fulfillment row.
  const orderedByKey = new Map<string, { catalogItemId: string; variantId: string | null; quantity: number }>();
  for (const li of order.lineItems) {
    if (catalogItemsById.get(li.catalogItemId)?.type !== "PRODUCT") continue;
    const key = lineKey(li.catalogItemId, li.variantId);
    const existing = orderedByKey.get(key);
    orderedByKey.set(key, {
      catalogItemId: li.catalogItemId,
      variantId: li.variantId,
      quantity: (existing?.quantity ?? 0) + Number(li.quantity),
    });
  }
  const shippedByKey = new Map<string, { catalogItemId: string; variantId: string | null; quantity: number }>();
  for (const demand of postedDemands) {
    for (const line of demand.lines) {
      const key = lineKey(line.catalogItemId, line.variantId);
      const existing = shippedByKey.get(key);
      shippedByKey.set(key, {
        catalogItemId: line.catalogItemId,
        variantId: line.variantId,
        quantity: (existing?.quantity ?? 0) + Number(line.quantity),
      });
    }
  }
  const returnedByKey = new Map<string, number>();
  for (const ret of salesReturns) {
    for (const line of ret.lines) {
      const key = lineKey(line.catalogItemId, line.variantId);
      returnedByKey.set(key, (returnedByKey.get(key) ?? 0) + Number(line.quantity));
    }
  }

  return (
    <div className="flex max-w-2xl flex-col gap-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Заказ №{order.number}</h1>
        <div className="flex items-center gap-2">
          <CreateDocumentMenu
            orgSlug={org}
            orderId={order.id}
            canCreateDemand={can(ctx, "warehouse", "create")}
            canCreateInvoice={can(ctx, "invoicesOut", "create")}
            canCreatePayment={can(ctx, "payments", "create")}
            canCreatePurchaseOrder={can(ctx, "purchaseOrders", "create")}
            canCreateRetailSale={can(ctx, "retail", "create")}
          />
          <PrintDialog
            documentType="order"
            orgSlug={org}
            documentId={order.id}
            legalEntities={legalEntities.map((e) => ({ id: e.id, name: e.name }))}
            currentLegalEntityId={order.legalEntityId}
            openPdfInBrowser={ctx.openPdfInBrowser}
          />
          <OrderStatusSelect
            orgSlug={org}
            orderId={order.id}
            statusId={order.statusId}
            statusOptions={statusOptions}
          />
        </div>
      </div>
      {/* Order redesign: "Оплата" is never stored — always derived from
          Payment rows, so it renders here (read-only), not inside the
          editable OrderForm. */}
      <div>
        <Badge variant={paymentStatus.isPaid ? "default" : "secondary"}>
          {paymentStatus.isPaid
            ? "Оплачено"
            : `Оплачено ${formatMoney(paymentStatus.totalPaid, paymentStatus.currency)} из ${formatMoney(paymentStatus.totalOrder, paymentStatus.currency)}`}
        </Badge>
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
          barcode: c.barcode,
          variants: c.variants.map((v) => ({
            id: v.id,
            label: variantLabel(v.values) || (v.sku ?? v.id),
            price: v.priceOverride?.toString() ?? null,
            barcode: v.barcode,
          })),
        }))}
        contractOptions={contracts.map((c) => ({ value: c.id, label: `№${c.number}` }))}
        salesChannelOptions={salesChannels.map((c) => ({ value: c.id, label: c.name }))}
        legalEntityOptions={legalEntities.map((e) => ({ value: e.id, label: e.name }))}
        storeOptions={stores.map((s) => ({ value: s.id, label: s.name }))}
        projectOptions={projects.map((p) => ({ value: p.id, label: p.name }))}
        customFieldDefs={customFieldDefs}
        defaultValues={{
          clientId: order.clientId,
          assignedEmployeeId: order.assignedEmployeeId,
          contractId: order.contractId,
          salesChannelId: order.salesChannelId,
          legalEntityId: order.legalEntityId,
          storeId: order.storeId,
          projectId: order.projectId,
          isPosted: order.isPosted,
          isReserved: order.isReserved,
          lineItems: order.lineItems.map((li) => ({
            catalogItemId: li.catalogItemId,
            variantId: li.variantId,
            quantity: li.quantity.toString(),
          })),
          customFieldValues,
        }}
      />
      {/* "Создать документ" flow: Отгрузка is no longer an inline form here
          — the button above creates a draft and redirects straight to its
          own /warehouse/[id] page (МойСклад model). This list is just for
          finding your way back to any шipment (draft or posted) already
          tied to this order. */}
      {demands.length > 0 && (
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>№</TableHead>
                <TableHead>Склад</TableHead>
                <TableHead>Статус</TableHead>
                <TableHead>Дата</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {demands.map((d) => (
                <TableRow key={d.id}>
                  <TableCell>
                    <Link href={`/${org}/warehouse/${d.id}`} className="underline">
                      №{d.number}
                    </Link>
                  </TableCell>
                  <TableCell>{d.store.name}</TableCell>
                  <TableCell>
                    <Badge variant={d.isPosted ? "default" : "secondary"}>
                      {d.isPosted ? "Проведено" : "Черновик"}
                    </Badge>
                  </TableCell>
                  <TableCell>{d.createdAt.toLocaleDateString("ru-RU")}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
      {postedDemands.length > 0 && (
      <FulfillmentPanel
        orgSlug={org}
        kind="salesReturn"
        parentId={order.id}
        storeOptions={stores.map((s) => ({ value: s.id, label: s.name }))}
        defaultStoreId={ctx.defaultStoreId}
        lines={[...shippedByKey.entries()].map(([key, s]) => ({
          catalogItemId: s.catalogItemId,
          variantId: s.variantId,
          variantLabel: s.variantId ? (variantLabelById.get(s.variantId) ?? null) : null,
          name: catalogItemsById.get(s.catalogItemId)?.name ?? "—",
          ordered: s.quantity,
          fulfilled: returnedByKey.get(key) ?? 0,
        }))}
        history={salesReturns.map((r) => ({
          id: r.id,
          number: r.number,
          storeName: r.store.name,
          createdAt: r.createdAt.toLocaleDateString("ru-RU"),
        }))}
      />
      )}
      <AttachmentList
        orgSlug={org}
        entityType="Order"
        entityId={order.id}
        revalidateHref={`/${org}/orders/${order.id}`}
        attachments={attachments}
      />
      <EventFeed
        orgSlug={org}
        entityType="Order"
        entityId={order.id}
        revalidateHref={`/${org}/orders/${order.id}`}
        comments={comments}
      />
    </div>
  );
}

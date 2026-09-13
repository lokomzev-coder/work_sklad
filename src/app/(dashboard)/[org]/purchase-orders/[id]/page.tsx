import Link from "next/link";
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
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "@/components/ui/table";
import { createInvoiceFromPurchaseOrder } from "@/actions/invoices-in";
import { CreateSupplyButton } from "@/components/purchase-orders/create-supply-button";
import { variantLabel } from "@/lib/catalog-variants";
import { getSelectableStatuses } from "@/lib/document-statuses";
import { listCustomFieldDefinitions, getCustomFieldValues } from "@/lib/custom-fields";
import { getComments } from "@/lib/comments";
import { EventFeed } from "@/components/comments/event-feed";
import { listAttachments } from "@/lib/attachments";
import { AttachmentList } from "@/components/attachments/attachment-list";

// Block M6: composite key for grouping by (item, variant) — see
// actions/fulfillment.ts's lineKey for the same idiom used server-side.
function lineKey(catalogItemId: string, variantId: string | null): string {
  return `${catalogItemId}:${variantId ?? ""}`;
}

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

  const variantInclude = {
    variants: {
      where: { status: "ACTIVE" as const },
      include: { values: { include: { characteristic: true } } },
    },
  };

  // Block: split into two smaller sequential batches (was one 11-wide
  // Promise.all) — same fix as orders/[id]/page.tsx, see its comment for why
  // (local `prisma dev` proxy chokes on too many simultaneous new
  // connections). withDbRetry on each half — safe, every query is read-only.
  const [activeSuppliers, activeEmployees, activeCatalogItems, referencedSupplier, referencedEmployee, referencedCatalogItems] =
    await withDbRetry(() =>
      Promise.all([
        prisma.client.findMany({ where: { orgId: ctx.orgId, status: "ACTIVE" }, orderBy: { name: "asc" } }),
        prisma.employee.findMany({ where: { orgId: ctx.orgId, status: "ACTIVE" }, orderBy: { fullName: "asc" } }),
        prisma.catalogItem.findMany({
          where: { orgId: ctx.orgId, status: "ACTIVE" },
          orderBy: { name: "asc" },
          include: variantInclude,
        }),
        purchaseOrder.supplierId
          ? prisma.client.findUnique({ where: { id: purchaseOrder.supplierId } })
          : null,
        purchaseOrder.assignedEmployeeId
          ? prisma.employee.findUnique({ where: { id: purchaseOrder.assignedEmployeeId } })
          : null,
        prisma.catalogItem.findMany({
          where: { id: { in: referencedCatalogItemIds } },
          include: variantInclude,
        }),
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

  const [stores, supplies, purchaseReturns, comments] = await Promise.all([
    prisma.store.findMany({ where: { orgId: ctx.orgId, status: "ACTIVE" }, orderBy: { name: "asc" } }),
    // "Создать документ" flow (Block K remainder): unfiltered on purpose —
    // drafts must still show up in the "Приёмки" list below (so staff can
    // find their way back to an unfinished draft), just badged differently.
    // `postedSupplies` (derived below) is the posted-only view used for the
    // remaining-to-receive math and the purchase-return gate — a draft
    // hasn't actually added any stock yet.
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
    getComments(ctx.orgId, "PurchaseOrder", purchaseOrder.id, ctx.employeeId),
  ]);
  const attachments = await listAttachments(ctx.orgId, "PurchaseOrder", purchaseOrder.id);

  // Block M6: composite-keyed by (item, variant) so two line items of the
  // same item but different variants don't collapse into one fulfillment row.
  const postedSupplies = supplies.filter((s) => s.isPosted);
  const receivedByKey = new Map<string, { catalogItemId: string; variantId: string | null; quantity: number }>();
  for (const supply of postedSupplies) {
    for (const line of supply.lines) {
      const key = lineKey(line.catalogItemId, line.variantId);
      const existing = receivedByKey.get(key);
      receivedByKey.set(key, {
        catalogItemId: line.catalogItemId,
        variantId: line.variantId,
        quantity: (existing?.quantity ?? 0) + Number(line.quantity),
      });
    }
  }
  const returnedByKey = new Map<string, number>();
  for (const ret of purchaseReturns) {
    for (const line of ret.lines) {
      const key = lineKey(line.catalogItemId, line.variantId);
      returnedByKey.set(key, (returnedByKey.get(key) ?? 0) + Number(line.quantity));
    }
  }

  return (
    <div className="flex max-w-2xl flex-col gap-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Заказ поставщику №{purchaseOrder.number}</h1>
        <div className="flex items-center gap-2">
          {can(ctx, "warehouse", "create") && (
            <CreateSupplyButton orgSlug={org} purchaseOrderId={purchaseOrder.id} />
          )}
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
            openPdfInBrowser={ctx.openPdfInBrowser}
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
          variants: c.variants.map((v) => ({
            id: v.id,
            label: variantLabel(v.values) || (v.sku ?? v.id),
          })),
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
            variantId: li.variantId,
            quantity: li.quantity.toString(),
            unitCost: li.unitPriceSnapshot.toString(),
          })),
          customFieldValues,
        }}
      />
      {/* "Создать документ" flow (Block K remainder): the "Создать приёмку"
          button above creates a draft and redirects straight to its own
          /warehouse/[id] page (same МойСклад model as Отгрузка) — this list
          is just for finding your way back to any приёмка (draft or
          posted) already tied to this заказ поставщику. */}
      {supplies.length > 0 && (
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
              {supplies.map((s) => (
                <TableRow key={s.id}>
                  <TableCell>
                    <Link href={`/${org}/warehouse/${s.id}`} className="underline">
                      №{s.number}
                    </Link>
                  </TableCell>
                  <TableCell>{s.store.name}</TableCell>
                  <TableCell>
                    <Badge variant={s.isPosted ? "default" : "secondary"}>
                      {s.isPosted ? "Проведено" : "Черновик"}
                    </Badge>
                  </TableCell>
                  <TableCell>{s.createdAt.toLocaleDateString("ru-RU")}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
      {postedSupplies.length > 0 && (
      <FulfillmentPanel
        orgSlug={org}
        kind="purchaseReturn"
        parentId={purchaseOrder.id}
        storeOptions={stores.map((s) => ({ value: s.id, label: s.name }))}
        defaultStoreId={ctx.defaultStoreId}
        lines={[...receivedByKey.entries()].map(([key, r]) => ({
          catalogItemId: r.catalogItemId,
          variantId: r.variantId,
          variantLabel: r.variantId ? (variantLabelById.get(r.variantId) ?? null) : null,
          name: catalogItemsById.get(r.catalogItemId)?.name ?? "—",
          ordered: r.quantity,
          fulfilled: returnedByKey.get(key) ?? 0,
        }))}
        history={purchaseReturns.map((r) => ({
          id: r.id,
          number: r.number,
          storeName: r.store.name,
          createdAt: r.createdAt.toLocaleDateString("ru-RU"),
        }))}
      />
      )}
      <AttachmentList
        orgSlug={org}
        entityType="PurchaseOrder"
        entityId={purchaseOrder.id}
        revalidateHref={`/${org}/purchase-orders/${purchaseOrder.id}`}
        attachments={attachments}
      />
      <EventFeed
        orgSlug={org}
        entityType="PurchaseOrder"
        entityId={purchaseOrder.id}
        revalidateHref={`/${org}/purchase-orders/${purchaseOrder.id}`}
        comments={comments}
      />
    </div>
  );
}

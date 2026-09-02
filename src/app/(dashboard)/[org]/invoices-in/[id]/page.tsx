import { notFound } from "next/navigation";
import { prisma, withDbRetry } from "@/lib/prisma";
import { getOrgContext } from "@/lib/tenant";
import { can } from "@/lib/permissions";
import { InvoiceInForm } from "@/components/invoices/invoice-in-form";
import { InvoiceInStatusSelect } from "@/components/invoices/invoice-in-status-select";
import { InvoicePaymentPanel } from "@/components/invoices/invoice-payment-panel";
import { PrintDialog } from "@/components/print/print-dialog";
import { getSelectableStatuses } from "@/lib/document-statuses";
import { listCustomFieldDefinitions, getCustomFieldValues } from "@/lib/custom-fields";

export default async function InvoiceInDetailPage({
  params,
}: {
  params: Promise<{ org: string; id: string }>;
}) {
  const { org, id } = await params;
  const ctx = await getOrgContext(org);
  if (!can(ctx, "invoicesIn", "view")) notFound();

  const invoiceIn = await prisma.invoiceIn.findFirst({
    where: { id, orgId: ctx.orgId },
    include: { lineItems: true, purchaseOrder: { select: { number: true } } },
  });
  if (!invoiceIn) notFound();

  const referencedCatalogItemIds = invoiceIn.lineItems.map((li) => li.catalogItemId);

  // withDbRetry (lib/prisma.ts): see orders/[id]/page.tsx's comment — the
  // local `prisma dev` proxy can choke on a burst of simultaneous new
  // connections; split into two smaller batches as a second layer, safe
  // here since every query is read-only.
  const [activeSuppliers, activeCatalogItems, referencedSupplier, referencedCatalogItems] = await withDbRetry(() =>
    Promise.all([
      prisma.client.findMany({ where: { orgId: ctx.orgId, status: "ACTIVE" }, orderBy: { name: "asc" } }),
      prisma.catalogItem.findMany({ where: { orgId: ctx.orgId, status: "ACTIVE" }, orderBy: { name: "asc" } }),
      invoiceIn.supplierId ? prisma.client.findUnique({ where: { id: invoiceIn.supplierId } }) : null,
      prisma.catalogItem.findMany({ where: { id: { in: referencedCatalogItemIds } } }),
    ]),
  );

  const [contracts, legalEntities, statusOptions, customFieldDefs, customFieldValues, payments] = await withDbRetry(
    () =>
      Promise.all([
        prisma.contract.findMany({ where: { orgId: ctx.orgId }, orderBy: { number: "asc" } }),
        prisma.legalEntity.findMany({ where: { orgId: ctx.orgId, status: "ACTIVE" }, orderBy: { name: "asc" } }),
        getSelectableStatuses(ctx.orgId, "INVOICE_IN", invoiceIn.statusId, {
          role: ctx.role,
          customRoleId: ctx.customRoleId,
          employeeId: ctx.employeeId,
        }),
        listCustomFieldDefinitions(ctx.orgId, "INVOICE_IN"),
        getCustomFieldValues(invoiceIn.id),
        prisma.payment.findMany({ where: { invoiceInId: invoiceIn.id }, orderBy: { createdAt: "desc" } }),
      ]),
  );

  const suppliers = referencedSupplier
    ? [referencedSupplier, ...activeSuppliers.filter((c) => c.id !== referencedSupplier.id)]
    : activeSuppliers;
  const catalogItemsById = new Map([...activeCatalogItems, ...referencedCatalogItems].map((c) => [c.id, c]));
  const catalogItems = [...catalogItemsById.values()];

  const sum = invoiceIn.lineItems.reduce((s, li) => s + Number(li.unitPriceSnapshot) * Number(li.quantity), 0);
  const paid = payments.reduce((s, p) => s + Number(p.amount), 0);
  const currency = invoiceIn.lineItems[0]?.currency ?? "RUB";

  return (
    <div className="flex max-w-2xl flex-col gap-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Счёт №{invoiceIn.number}</h1>
        <div className="flex items-center gap-2">
          <PrintDialog
            documentType="invoiceIn"
            orgSlug={org}
            documentId={invoiceIn.id}
            legalEntities={legalEntities.map((e) => ({ id: e.id, name: e.name }))}
            currentLegalEntityId={invoiceIn.legalEntityId}
          />
          <InvoiceInStatusSelect
            orgSlug={org}
            invoiceInId={invoiceIn.id}
            statusId={invoiceIn.statusId}
            statusOptions={statusOptions}
          />
        </div>
      </div>
      <InvoiceInForm
        orgSlug={org}
        invoiceInId={invoiceIn.id}
        supplierOptions={suppliers.map((c) => ({ value: c.id, label: c.name }))}
        catalogOptions={catalogItems.map((c) => ({
          id: c.id,
          name: c.name,
          unitPrice: c.unitPrice.toString(),
          currency: c.currency,
        }))}
        contractOptions={contracts.map((c) => ({ value: c.id, label: `№${c.number}` }))}
        legalEntityOptions={legalEntities.map((e) => ({ value: e.id, label: e.name }))}
        customFieldDefs={customFieldDefs}
        sourcePurchaseOrder={
          invoiceIn.purchaseOrder
            ? { number: invoiceIn.purchaseOrder.number, href: `/${org}/purchase-orders/${invoiceIn.purchaseOrderId}` }
            : null
        }
        defaultValues={{
          supplierId: invoiceIn.supplierId,
          contractId: invoiceIn.contractId,
          legalEntityId: invoiceIn.legalEntityId,
          lineItems: invoiceIn.lineItems.map((li) => ({
            catalogItemId: li.catalogItemId,
            quantity: li.quantity.toString(),
            unitCost: li.unitPriceSnapshot.toString(),
          })),
          customFieldValues,
        }}
      />
      <InvoicePaymentPanel
        orgSlug={org}
        invoiceId={invoiceIn.id}
        invoiceType="in"
        sum={sum}
        paid={paid}
        currency={currency}
        payments={payments.map((p) => ({
          id: p.id,
          amount: p.amount.toString(),
          currency: p.currency,
          createdAt: p.createdAt.toLocaleDateString("ru-RU"),
          comment: p.comment,
        }))}
      />
    </div>
  );
}

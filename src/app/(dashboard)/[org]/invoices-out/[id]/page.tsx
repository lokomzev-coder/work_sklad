import { notFound } from "next/navigation";
import { prisma, withDbRetry } from "@/lib/prisma";
import { getOrgContext } from "@/lib/tenant";
import { can } from "@/lib/permissions";
import { InvoiceOutForm } from "@/components/invoices/invoice-out-form";
import { InvoiceOutStatusSelect } from "@/components/invoices/invoice-out-status-select";
import { InvoicePaymentPanel } from "@/components/invoices/invoice-payment-panel";
import { PrintDialog } from "@/components/print/print-dialog";
import { variantLabel } from "@/lib/catalog-variants";
import { getSelectableStatuses } from "@/lib/document-statuses";
import { listCustomFieldDefinitions, getCustomFieldValues } from "@/lib/custom-fields";
import { getComments } from "@/lib/comments";
import { EventFeed } from "@/components/comments/event-feed";
import { listAttachments } from "@/lib/attachments";
import { AttachmentList } from "@/components/attachments/attachment-list";

export default async function InvoiceOutDetailPage({
  params,
}: {
  params: Promise<{ org: string; id: string }>;
}) {
  const { org, id } = await params;
  const ctx = await getOrgContext(org);
  if (!can(ctx, "invoicesOut", "view")) notFound();

  const invoiceOut = await prisma.invoiceOut.findFirst({
    where: { id, orgId: ctx.orgId },
    include: { lineItems: true, order: { select: { number: true } } },
  });
  if (!invoiceOut) notFound();

  const referencedCatalogItemIds = invoiceOut.lineItems.map((li) => li.catalogItemId);
  const variantInclude = {
    variants: {
      where: { status: "ACTIVE" as const },
      include: { values: { include: { characteristic: true } } },
    },
  };

  // withDbRetry (lib/prisma.ts): see orders/[id]/page.tsx's comment — the
  // local `prisma dev` proxy can choke on a burst of simultaneous new
  // connections; split into two smaller batches as a second layer, safe
  // here since every query is read-only.
  const [activeClients, activeCatalogItems, referencedClient, referencedCatalogItems] = await withDbRetry(() =>
    Promise.all([
      prisma.client.findMany({ where: { orgId: ctx.orgId, status: "ACTIVE" }, orderBy: { name: "asc" } }),
      prisma.catalogItem.findMany({
        where: { orgId: ctx.orgId, status: "ACTIVE" },
        orderBy: { name: "asc" },
        include: variantInclude,
      }),
      invoiceOut.clientId ? prisma.client.findUnique({ where: { id: invoiceOut.clientId } }) : null,
      prisma.catalogItem.findMany({ where: { id: { in: referencedCatalogItemIds } }, include: variantInclude }),
    ]),
  );

  const [contracts, legalEntities, statusOptions, customFieldDefs, customFieldValues, payments, comments] = await withDbRetry(
    () =>
      Promise.all([
        prisma.contract.findMany({ where: { orgId: ctx.orgId }, orderBy: { number: "asc" } }),
        prisma.legalEntity.findMany({ where: { orgId: ctx.orgId, status: "ACTIVE" }, orderBy: { name: "asc" } }),
        getSelectableStatuses(ctx.orgId, "INVOICE_OUT", invoiceOut.statusId, {
          role: ctx.role,
          customRoleId: ctx.customRoleId,
          employeeId: ctx.employeeId,
        }),
        listCustomFieldDefinitions(ctx.orgId, "INVOICE_OUT"),
        getCustomFieldValues(invoiceOut.id),
        prisma.payment.findMany({ where: { invoiceOutId: invoiceOut.id }, orderBy: { createdAt: "desc" } }),
        getComments(ctx.orgId, "InvoiceOut", invoiceOut.id, ctx.employeeId),
      ]),
  );
  const attachments = await listAttachments(ctx.orgId, "InvoiceOut", invoiceOut.id);

  const clients = referencedClient
    ? [referencedClient, ...activeClients.filter((c) => c.id !== referencedClient.id)]
    : activeClients;
  const catalogItemsById = new Map([...activeCatalogItems, ...referencedCatalogItems].map((c) => [c.id, c]));
  const catalogItems = [...catalogItemsById.values()];

  const sum = invoiceOut.lineItems.reduce(
    (s, li) => s + Number(li.unitPriceSnapshot) * Number(li.quantity),
    0,
  );
  const paid = payments.reduce((s, p) => s + Number(p.amount), 0);
  const currency = invoiceOut.lineItems[0]?.currency ?? "RUB";

  return (
    <div className="flex max-w-2xl flex-col gap-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Счёт №{invoiceOut.number}</h1>
        <div className="flex items-center gap-2">
          <PrintDialog
            documentType="invoiceOut"
            orgSlug={org}
            documentId={invoiceOut.id}
            legalEntities={legalEntities.map((e) => ({ id: e.id, name: e.name }))}
            currentLegalEntityId={invoiceOut.legalEntityId}
            openPdfInBrowser={ctx.openPdfInBrowser}
          />
          <InvoiceOutStatusSelect
            orgSlug={org}
            invoiceOutId={invoiceOut.id}
            statusId={invoiceOut.statusId}
            statusOptions={statusOptions}
          />
        </div>
      </div>
      <InvoiceOutForm
        orgSlug={org}
        invoiceOutId={invoiceOut.id}
        clientOptions={clients.map((c) => ({ value: c.id, label: c.name }))}
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
        legalEntityOptions={legalEntities.map((e) => ({ value: e.id, label: e.name }))}
        customFieldDefs={customFieldDefs}
        sourceOrder={
          invoiceOut.order ? { number: invoiceOut.order.number, href: `/${org}/orders/${invoiceOut.orderId}` } : null
        }
        defaultValues={{
          clientId: invoiceOut.clientId,
          contractId: invoiceOut.contractId,
          legalEntityId: invoiceOut.legalEntityId,
          lineItems: invoiceOut.lineItems.map((li) => ({
            catalogItemId: li.catalogItemId,
            variantId: li.variantId,
            quantity: li.quantity.toString(),
          })),
          customFieldValues,
        }}
      />
      <InvoicePaymentPanel
        orgSlug={org}
        invoiceId={invoiceOut.id}
        invoiceType="out"
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
      <AttachmentList
        orgSlug={org}
        entityType="InvoiceOut"
        entityId={invoiceOut.id}
        revalidateHref={`/${org}/invoices-out/${invoiceOut.id}`}
        attachments={attachments}
      />
      <EventFeed
        orgSlug={org}
        entityType="InvoiceOut"
        entityId={invoiceOut.id}
        revalidateHref={`/${org}/invoices-out/${invoiceOut.id}`}
        comments={comments}
      />
    </div>
  );
}

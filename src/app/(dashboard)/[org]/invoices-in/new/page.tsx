import { prisma, withDbRetry } from "@/lib/prisma";
import { getOrgContext } from "@/lib/tenant";
import { InvoiceInForm } from "@/components/invoices/invoice-in-form";
import { listCustomFieldDefinitions } from "@/lib/custom-fields";

export default async function NewInvoiceInPage({
  params,
}: {
  params: Promise<{ org: string }>;
}) {
  const { org } = await params;
  const ctx = await getOrgContext(org);

  const [suppliers, catalogItems, contracts, legalEntities, customFieldDefs] = await withDbRetry(() =>
    Promise.all([
      prisma.client.findMany({ where: { orgId: ctx.orgId, status: "ACTIVE" }, orderBy: { name: "asc" } }),
      prisma.catalogItem.findMany({ where: { orgId: ctx.orgId, status: "ACTIVE" }, orderBy: { name: "asc" } }),
      prisma.contract.findMany({ where: { orgId: ctx.orgId }, orderBy: { number: "asc" } }),
      prisma.legalEntity.findMany({ where: { orgId: ctx.orgId, status: "ACTIVE" }, orderBy: { name: "asc" } }),
      listCustomFieldDefinitions(ctx.orgId, "INVOICE_IN"),
    ]),
  );

  return (
    <div className="flex max-w-2xl flex-col gap-4">
      <h1 className="text-2xl font-semibold">Новый счёт поставщика</h1>
      <InvoiceInForm
        orgSlug={org}
        invoiceInId={null}
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
        defaultValues={{
          supplierId: null,
          contractId: null,
          legalEntityId: ctx.defaultLegalEntityId,
          lineItems: [],
        }}
      />
    </div>
  );
}

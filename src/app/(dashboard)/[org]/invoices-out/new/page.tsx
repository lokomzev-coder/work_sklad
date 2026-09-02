import { prisma, withDbRetry } from "@/lib/prisma";
import { getOrgContext } from "@/lib/tenant";
import { InvoiceOutForm } from "@/components/invoices/invoice-out-form";
import { variantLabel } from "@/lib/catalog-variants";
import { listCustomFieldDefinitions } from "@/lib/custom-fields";

export default async function NewInvoiceOutPage({
  params,
}: {
  params: Promise<{ org: string }>;
}) {
  const { org } = await params;
  const ctx = await getOrgContext(org);

  const [clients, catalogItems, contracts, legalEntities, customFieldDefs] = await withDbRetry(() =>
    Promise.all([
      prisma.client.findMany({ where: { orgId: ctx.orgId, status: "ACTIVE" }, orderBy: { name: "asc" } }),
      prisma.catalogItem.findMany({
        where: { orgId: ctx.orgId, status: "ACTIVE" },
        orderBy: { name: "asc" },
        include: {
          variants: {
            where: { status: "ACTIVE" },
            include: { values: { include: { characteristic: true } } },
          },
        },
      }),
      prisma.contract.findMany({ where: { orgId: ctx.orgId }, orderBy: { number: "asc" } }),
      prisma.legalEntity.findMany({ where: { orgId: ctx.orgId, status: "ACTIVE" }, orderBy: { name: "asc" } }),
      listCustomFieldDefinitions(ctx.orgId, "INVOICE_OUT"),
    ]),
  );

  return (
    <div className="flex max-w-2xl flex-col gap-4">
      <h1 className="text-2xl font-semibold">Новый счёт покупателю</h1>
      <InvoiceOutForm
        orgSlug={org}
        invoiceOutId={null}
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
        defaultValues={{
          clientId: null,
          contractId: null,
          legalEntityId: ctx.defaultLegalEntityId,
          lineItems: [],
        }}
      />
    </div>
  );
}

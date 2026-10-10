import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getOrgContext } from "@/lib/tenant";
import { can } from "@/lib/permissions";
import { PrintDocument } from "@/components/print/print-document";
import { listRelatedFieldConfigs, resolveRelatedFields } from "@/lib/related-fields";
import { getCustomFieldValues } from "@/lib/custom-fields";

export default async function PrintInvoiceInPage({
  params,
  searchParams,
}: {
  params: Promise<{ org: string; id: string }>;
  searchParams: Promise<{ legalEntityId?: string; prices?: string }>;
}) {
  const { org, id } = await params;
  const { legalEntityId, prices } = await searchParams;
  const ctx = await getOrgContext(org);
  if (!can(ctx, "invoicesIn", "view")) notFound();

  const invoiceIn = await prisma.invoiceIn.findFirst({
    where: { id, orgId: ctx.orgId },
    include: {
      supplier: true,
      legalEntity: true,
      lineItems: { include: { catalogItem: { include: { unit: true } } } },
    },
  });
  if (!invoiceIn) notFound();

  const overrideLegalEntity = legalEntityId
    ? await prisma.legalEntity.findFirst({ where: { id: legalEntityId, orgId: ctx.orgId } })
    : null;
  const defaultLegalEntity = invoiceIn.legalEntity
    ? null
    : await prisma.legalEntity.findFirst({ where: { orgId: ctx.orgId, isDefault: true, status: "ACTIVE" } });
  const issuer = overrideLegalEntity ?? invoiceIn.legalEntity ?? defaultLegalEntity;
  const showPrices = prices !== "0";

  const total = invoiceIn.lineItems.reduce(
    (sum, li) => sum + Number(li.unitPriceSnapshot) * Number(li.quantity),
    0,
  );
  const currency = invoiceIn.lineItems[0]?.currency ?? "RUB";

  const relatedFieldConfigs = await listRelatedFieldConfigs(ctx.orgId, "INVOICE_IN");
  const supplierCustomFieldValues = relatedFieldConfigs.some((c) => c.sourceKind === "CUSTOM") && invoiceIn.supplier
    ? await getCustomFieldValues(invoiceIn.supplier.id)
    : {};
  // Unlike the detail-page panel, a printed document omits blank
  // configured fields entirely rather than showing "—" — the panel's "—"
  // is a configuration-confirmation signal for the admin, not something
  // that belongs on a document handed to a customer.
  const relatedFields = resolveRelatedFields(
    relatedFieldConfigs,
    invoiceIn.supplier,
    supplierCustomFieldValues,
  ).filter((f) => f.value !== "—");

  return (
    <PrintDocument
      title={`Счёт поставщика №${invoiceIn.number}${invoiceIn.name ? ` — ${invoiceIn.name}` : ""} от ${invoiceIn.createdAt.toLocaleDateString("ru-RU")}`}
      issuer={
        issuer
          ? {
              name: issuer.name,
              inn: issuer.inn,
              kpp: issuer.kpp,
              ogrn: issuer.ogrn,
              address: issuer.address,
              bankName: issuer.bankName,
              bankBik: issuer.bankBik,
              bankAccount: issuer.bankAccount,
            }
          : { name: ctx.orgName }
      }
      counterpartyLabel="Поставщик"
      counterparty={
        invoiceIn.supplier
          ? { name: invoiceIn.supplier.name, inn: invoiceIn.supplier.inn, address: invoiceIn.supplier.address }
          : null
      }
      lines={invoiceIn.lineItems.map((li) => ({
        name: li.catalogItem.name,
        quantity: li.quantity.toString(),
        unit: li.catalogItem.unit?.shortName ?? "—",
        price: Number(li.unitPriceSnapshot).toFixed(2),
        sum: (Number(li.unitPriceSnapshot) * Number(li.quantity)).toFixed(2),
      }))}
      total={total.toFixed(2)}
      currency={currency}
      showPrices={showPrices}
      relatedFields={relatedFields}
    />
  );
}

import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getOrgContext } from "@/lib/tenant";
import { can } from "@/lib/permissions";
import { PrintDocument } from "@/components/print/print-document";

export default async function PrintInvoiceOutPage({
  params,
  searchParams,
}: {
  params: Promise<{ org: string; id: string }>;
  searchParams: Promise<{ legalEntityId?: string; prices?: string }>;
}) {
  const { org, id } = await params;
  const { legalEntityId, prices } = await searchParams;
  const ctx = await getOrgContext(org);
  if (!can(ctx, "invoicesOut", "view")) notFound();

  const invoiceOut = await prisma.invoiceOut.findFirst({
    where: { id, orgId: ctx.orgId },
    include: {
      client: true,
      legalEntity: true,
      lineItems: { include: { catalogItem: { include: { unit: true } } } },
    },
  });
  if (!invoiceOut) notFound();

  const overrideLegalEntity = legalEntityId
    ? await prisma.legalEntity.findFirst({ where: { id: legalEntityId, orgId: ctx.orgId } })
    : null;
  const defaultLegalEntity = invoiceOut.legalEntity
    ? null
    : await prisma.legalEntity.findFirst({ where: { orgId: ctx.orgId, isDefault: true, status: "ACTIVE" } });
  const issuer = overrideLegalEntity ?? invoiceOut.legalEntity ?? defaultLegalEntity;
  const showPrices = prices !== "0";

  const total = invoiceOut.lineItems.reduce(
    (sum, li) => sum + Number(li.unitPriceSnapshot) * Number(li.quantity),
    0,
  );
  const currency = invoiceOut.lineItems[0]?.currency ?? "RUB";

  return (
    <PrintDocument
      title={`Счёт покупателю №${invoiceOut.number} от ${invoiceOut.createdAt.toLocaleDateString("ru-RU")}`}
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
      counterpartyLabel="Покупатель"
      counterparty={
        invoiceOut.client
          ? { name: invoiceOut.client.name, inn: invoiceOut.client.inn, address: invoiceOut.client.address }
          : null
      }
      lines={invoiceOut.lineItems.map((li) => ({
        name: li.catalogItem.name,
        quantity: li.quantity.toString(),
        unit: li.catalogItem.unit?.shortName ?? "—",
        price: Number(li.unitPriceSnapshot).toFixed(2),
        sum: (Number(li.unitPriceSnapshot) * Number(li.quantity)).toFixed(2),
      }))}
      total={total.toFixed(2)}
      currency={currency}
      showPrices={showPrices}
    />
  );
}

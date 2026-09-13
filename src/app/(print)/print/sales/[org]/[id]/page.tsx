import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getOrgContext } from "@/lib/tenant";
import { can } from "@/lib/permissions";
import { PrintDocument } from "@/components/print/print-document";

export default async function PrintRetailSalePage({
  params,
}: {
  params: Promise<{ org: string; id: string }>;
}) {
  const { org, id } = await params;
  const ctx = await getOrgContext(org);
  if (!can(ctx, "retail", "view")) notFound();

  const sale = await prisma.retailSale.findFirst({
    where: { id, orgId: ctx.orgId },
    include: {
      client: true,
      lineItems: { include: { catalogItem: { include: { unit: true } } } },
    },
  });
  if (!sale) notFound();

  const defaultLegalEntity = await prisma.legalEntity.findFirst({
    where: { orgId: ctx.orgId, isDefault: true, status: "ACTIVE" },
  });

  const total = sale.lineItems.reduce(
    (sum, li) => sum + Number(li.unitPriceSnapshot) * Number(li.quantity),
    0,
  );
  const currency = sale.lineItems[0]?.currency ?? "RUB";

  return (
    <PrintDocument
      title={`Кассовый чек №${sale.number} от ${sale.createdAt.toLocaleString("ru-RU")}`}
      issuer={
        defaultLegalEntity
          ? {
              name: defaultLegalEntity.name,
              inn: defaultLegalEntity.inn,
              kpp: defaultLegalEntity.kpp,
              ogrn: defaultLegalEntity.ogrn,
              address: defaultLegalEntity.address,
              bankName: defaultLegalEntity.bankName,
              bankBik: defaultLegalEntity.bankBik,
              bankAccount: defaultLegalEntity.bankAccount,
            }
          : { name: ctx.orgName }
      }
      counterpartyLabel="Покупатель"
      counterparty={
        sale.client.isWalkIn
          ? null
          : { name: sale.client.name, inn: sale.client.inn, address: sale.client.address }
      }
      lines={sale.lineItems.map((li) => ({
        name: li.catalogItem.name,
        quantity: li.quantity.toString(),
        unit: li.catalogItem.unit?.shortName ?? "—",
        price: Number(li.unitPriceSnapshot).toFixed(2),
        sum: (Number(li.unitPriceSnapshot) * Number(li.quantity)).toFixed(2),
      }))}
      total={total.toFixed(2)}
      currency={currency}
    />
  );
}

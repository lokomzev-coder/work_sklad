import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getOrgContext } from "@/lib/tenant";
import { can } from "@/lib/permissions";
import { isRowVisible } from "@/lib/scope";
import { PrintDocument } from "@/components/print/print-document";

export default async function PrintPurchaseOrderPage({
  params,
  searchParams,
}: {
  params: Promise<{ org: string; id: string }>;
  searchParams: Promise<{ legalEntityId?: string; prices?: string }>;
}) {
  const { org, id } = await params;
  const { legalEntityId, prices } = await searchParams;
  const ctx = await getOrgContext(org);
  if (!can(ctx, "purchaseOrders", "view")) notFound();

  const purchaseOrder = await prisma.purchaseOrder.findFirst({
    where: { id, orgId: ctx.orgId },
    include: {
      supplier: true,
      legalEntity: true,
      lineItems: { include: { catalogItem: { include: { unit: true } } } },
    },
  });
  if (!purchaseOrder) notFound();
  if (!(await isRowVisible(ctx, "purchaseOrders", purchaseOrder.assignedEmployeeId))) notFound();

  // Block M4: ?legalEntityId lets the print dialog override the document's
  // own issuer for this printout only — doesn't touch purchaseOrder.legalEntityId.
  const overrideLegalEntity = legalEntityId
    ? await prisma.legalEntity.findFirst({ where: { id: legalEntityId, orgId: ctx.orgId } })
    : null;
  const defaultLegalEntity = purchaseOrder.legalEntity
    ? null
    : await prisma.legalEntity.findFirst({ where: { orgId: ctx.orgId, isDefault: true, status: "ACTIVE" } });
  const issuer = overrideLegalEntity ?? purchaseOrder.legalEntity ?? defaultLegalEntity;
  const showPrices = prices !== "0";

  const total = purchaseOrder.lineItems.reduce(
    (sum, li) => sum + Number(li.unitPriceSnapshot) * Number(li.quantity),
    0,
  );
  const currency = purchaseOrder.lineItems[0]?.currency ?? "RUB";

  return (
    <PrintDocument
      title={`Заказ поставщику №${purchaseOrder.number} от ${purchaseOrder.createdAt.toLocaleDateString("ru-RU")}`}
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
        purchaseOrder.supplier
          ? { name: purchaseOrder.supplier.name, inn: purchaseOrder.supplier.inn, address: purchaseOrder.supplier.address }
          : null
      }
      lines={purchaseOrder.lineItems.map((li) => ({
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

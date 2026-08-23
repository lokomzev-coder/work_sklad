import { prisma } from "@/lib/prisma";
import { getOrgContext } from "@/lib/tenant";
import { PurchaseOrderForm } from "@/components/purchase-orders/purchase-order-form";

export default async function NewPurchaseOrderPage({
  params,
}: {
  params: Promise<{ org: string }>;
}) {
  const { org } = await params;
  const ctx = await getOrgContext(org);

  const [suppliers, employees, catalogItems, contracts, legalEntities] = await Promise.all([
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
    }),
    prisma.contract.findMany({ where: { orgId: ctx.orgId }, orderBy: { number: "asc" } }),
    prisma.legalEntity.findMany({ where: { orgId: ctx.orgId, status: "ACTIVE" }, orderBy: { name: "asc" } }),
  ]);

  return (
    <div className="flex max-w-2xl flex-col gap-4">
      <h1 className="text-2xl font-semibold">Новый заказ поставщику</h1>
      <PurchaseOrderForm
        orgSlug={org}
        purchaseOrderId={null}
        supplierOptions={suppliers.map((c) => ({ value: c.id, label: c.name }))}
        employeeOptions={employees.map((e) => ({ value: e.id, label: e.fullName }))}
        catalogOptions={catalogItems.map((c) => ({
          id: c.id,
          name: c.name,
          unitPrice: c.unitPrice.toString(),
          currency: c.currency,
        }))}
        contractOptions={contracts.map((c) => ({ value: c.id, label: `№${c.number}` }))}
        legalEntityOptions={legalEntities.map((e) => ({ value: e.id, label: e.name }))}
      />
    </div>
  );
}

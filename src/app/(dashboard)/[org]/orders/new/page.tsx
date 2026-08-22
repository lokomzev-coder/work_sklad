import { prisma } from "@/lib/prisma";
import { getOrgContext } from "@/lib/tenant";
import { OrderForm } from "@/components/orders/order-form";
import { variantLabel } from "@/lib/catalog-variants";

export default async function NewOrderPage({
  params,
}: {
  params: Promise<{ org: string }>;
}) {
  const { org } = await params;
  const ctx = await getOrgContext(org);

  const [clients, employees, catalogItems, contracts, salesChannels] = await Promise.all([
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
      include: {
        variants: {
          where: { status: "ACTIVE" },
          include: { values: { include: { characteristic: true } } },
        },
      },
    }),
    prisma.contract.findMany({ where: { orgId: ctx.orgId }, orderBy: { number: "asc" } }),
    prisma.salesChannel.findMany({ where: { orgId: ctx.orgId }, orderBy: { name: "asc" } }),
  ]);

  return (
    <div className="flex max-w-2xl flex-col gap-4">
      <h1 className="text-2xl font-semibold">Новый заказ</h1>
      <OrderForm
        orgSlug={org}
        orderId={null}
        clientOptions={clients.map((c) => ({ value: c.id, label: c.name }))}
        employeeOptions={employees.map((e) => ({
          value: e.id,
          label: e.fullName,
        }))}
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
        salesChannelOptions={salesChannels.map((c) => ({ value: c.id, label: c.name }))}
      />
    </div>
  );
}

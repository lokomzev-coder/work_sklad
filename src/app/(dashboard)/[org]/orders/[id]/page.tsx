import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getOrgContext } from "@/lib/tenant";
import { OrderForm } from "@/components/orders/order-form";

export default async function EditOrderPage({
  params,
}: {
  params: Promise<{ org: string; id: string }>;
}) {
  const { org, id } = await params;
  const ctx = await getOrgContext(org);

  const order = await prisma.order.findFirst({
    where: { id, orgId: ctx.orgId },
    include: { lineItems: true },
  });

  if (!order) {
    notFound();
  }

  const referencedCatalogItemIds = order.lineItems.map((li) => li.catalogItemId);

  const [activeClients, activeEmployees, activeCatalogItems, referencedClient, referencedEmployee, referencedCatalogItems] =
    await Promise.all([
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
      order.clientId
        ? prisma.client.findUnique({ where: { id: order.clientId } })
        : null,
      order.assignedEmployeeId
        ? prisma.employee.findUnique({ where: { id: order.assignedEmployeeId } })
        : null,
      prisma.catalogItem.findMany({
        where: { id: { in: referencedCatalogItemIds } },
      }),
    ]);

  // Archived entities stay out of the "pick something new" list, but an
  // already-referenced archived entity must still render (its FK is valid).
  const clients = referencedClient
    ? [referencedClient, ...activeClients.filter((c) => c.id !== referencedClient.id)]
    : activeClients;
  const employees = referencedEmployee
    ? [referencedEmployee, ...activeEmployees.filter((e) => e.id !== referencedEmployee.id)]
    : activeEmployees;
  const catalogItemsById = new Map(
    [...activeCatalogItems, ...referencedCatalogItems].map((c) => [c.id, c]),
  );
  const catalogItems = [...catalogItemsById.values()];

  return (
    <div className="flex max-w-2xl flex-col gap-4">
      <h1 className="text-2xl font-semibold">Заказ №{order.number}</h1>
      <OrderForm
        orgSlug={org}
        orderId={order.id}
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
        }))}
        defaultValues={{
          clientId: order.clientId,
          assignedEmployeeId: order.assignedEmployeeId,
          lineItems: order.lineItems.map((li) => ({
            catalogItemId: li.catalogItemId,
            quantity: li.quantity.toString(),
          })),
        }}
      />
    </div>
  );
}

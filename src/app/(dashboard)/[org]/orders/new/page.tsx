import { prisma, withDbRetry } from "@/lib/prisma";
import { getOrgContext } from "@/lib/tenant";
import { OrderForm } from "@/components/orders/order-form";
import { variantLabel } from "@/lib/catalog-variants";
import { listCustomFieldDefinitions } from "@/lib/custom-fields";

export default async function NewOrderPage({
  params,
}: {
  params: Promise<{ org: string }>;
}) {
  const { org } = await params;
  const ctx = await getOrgContext(org);

  // withDbRetry (lib/prisma.ts): see orders/[id]/page.tsx's comment — the
  // local `prisma dev` proxy can choke on a burst of simultaneous new
  // connections. Order redesign added storeId/projectId lookups, pushing
  // this from 7 to 9 queries — right at the ~9-10 threshold documented in
  // (dashboard)/[org]/page.tsx's own comment — so split into two smaller
  // batches (was one 9-wide Promise.all) rather than relying on a single
  // withDbRetry retry to save an already-oversized burst.
  const [clients, employees, catalogItems, contracts, salesChannels] = await withDbRetry(() =>
    Promise.all([
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
    ]),
  );
  const [legalEntities, stores, projects, customFieldDefs] = await withDbRetry(() =>
    Promise.all([
      prisma.legalEntity.findMany({ where: { orgId: ctx.orgId, status: "ACTIVE" }, orderBy: { name: "asc" } }),
      prisma.store.findMany({ where: { orgId: ctx.orgId, status: "ACTIVE" }, orderBy: { name: "asc" } }),
      prisma.project.findMany({ where: { orgId: ctx.orgId, status: "ACTIVE" }, orderBy: { name: "asc" } }),
      listCustomFieldDefinitions(ctx.orgId, "ORDER"),
    ]),
  );

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
          barcode: c.barcode,
          variants: c.variants.map((v) => ({
            id: v.id,
            label: variantLabel(v.values) || (v.sku ?? v.id),
            price: v.priceOverride?.toString() ?? null,
            barcode: v.barcode,
          })),
        }))}
        contractOptions={contracts.map((c) => ({ value: c.id, label: `№${c.number}` }))}
        salesChannelOptions={salesChannels.map((c) => ({ value: c.id, label: c.name }))}
        legalEntityOptions={legalEntities.map((e) => ({ value: e.id, label: e.name }))}
        storeOptions={stores.map((s) => ({ value: s.id, label: s.name }))}
        projectOptions={projects.map((p) => ({ value: p.id, label: p.name }))}
        customFieldDefs={customFieldDefs}
        defaultValues={{
          clientId: null,
          assignedEmployeeId: null,
          contractId: null,
          salesChannelId: null,
          legalEntityId: ctx.defaultLegalEntityId,
          storeId: ctx.defaultStoreId,
          projectId: null,
          isPosted: false,
          isReserved: false,
          lineItems: [],
        }}
      />
    </div>
  );
}

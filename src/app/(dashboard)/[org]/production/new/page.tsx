import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getOrgContext } from "@/lib/tenant";
import { can } from "@/lib/permissions";
import { listCustomFieldDefinitions } from "@/lib/custom-fields";
import { ProductionOrderForm } from "@/components/production/production-order-form";

export default async function NewProductionOrderPage({
  params,
}: {
  params: Promise<{ org: string }>;
}) {
  const { org } = await params;
  const ctx = await getOrgContext(org);
  if (!can(ctx, "productionOrders", "create")) notFound();

  const [techCards, stores, employees, customFieldDefs] = await Promise.all([
    prisma.techCard.findMany({
      where: { orgId: ctx.orgId, status: "ACTIVE" },
      include: { outputItem: true },
      orderBy: { name: "asc" },
    }),
    prisma.store.findMany({ where: { orgId: ctx.orgId, status: "ACTIVE" }, orderBy: { name: "asc" } }),
    prisma.employee.findMany({ where: { orgId: ctx.orgId, status: "ACTIVE" }, orderBy: { fullName: "asc" } }),
    listCustomFieldDefinitions(ctx.orgId, "PRODUCTION_ORDER"),
  ]);

  return (
    <div className="flex max-w-2xl flex-col gap-4">
      <h1 className="text-2xl font-semibold">Новое производственное задание</h1>
      <ProductionOrderForm
        orgSlug={org}
        productionOrderId={null}
        techCardOptions={techCards.map((t) => ({ value: t.id, label: `${t.name} → ${t.outputItem.name}` }))}
        storeOptions={stores.map((s) => ({ value: s.id, label: s.name }))}
        defaultStoreId={ctx.defaultStoreId}
        employeeOptions={employees.map((e) => ({ value: e.id, label: e.fullName }))}
        customFieldDefs={customFieldDefs}
      />
    </div>
  );
}

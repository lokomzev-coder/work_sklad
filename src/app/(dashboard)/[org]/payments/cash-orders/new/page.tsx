import { prisma } from "@/lib/prisma";
import { getOrgContext } from "@/lib/tenant";
import { createCashOrder } from "@/actions/cash-orders";
import { CashOrderForm } from "@/components/payments/cash-order-form";

export default async function NewCashOrderPage({
  params,
}: {
  params: Promise<{ org: string }>;
}) {
  const { org } = await params;
  const ctx = await getOrgContext(org);
  const boundAction = createCashOrder.bind(null, org);

  const [clients, expenseItems] = await Promise.all([
    prisma.client.findMany({ where: { orgId: ctx.orgId, status: "ACTIVE" }, orderBy: { name: "asc" } }),
    prisma.expenseItem.findMany({ where: { orgId: ctx.orgId }, orderBy: { name: "asc" } }),
  ]);

  return (
    <div className="flex max-w-lg flex-col gap-4">
      <h1 className="text-2xl font-semibold">Новый кассовый ордер</h1>
      <CashOrderForm
        orgSlug={org}
        action={boundAction}
        counterpartyOptions={clients.map((c) => ({ value: c.id, label: c.name }))}
        expenseItems={expenseItems}
      />
    </div>
  );
}

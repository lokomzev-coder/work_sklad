import { prisma } from "@/lib/prisma";

export interface ClientBalance {
  /** What this counterparty owes us: their orders' total minus payments IN. */
  receivable: number;
  /** What we owe this counterparty as a supplier: their purchase orders'
   * total minus payments OUT. */
  payable: number;
}

/**
 * A minimal "who owes whom" view — enough to answer the practical question
 * without modeling full invoices yet (ROADMAP Block C3 follow-up). A Client
 * can be both a customer (orders) and a supplier (purchase orders), so the
 * two balances are tracked independently rather than netted together.
 */
export async function getClientBalance(orgId: string, clientId: string): Promise<ClientBalance> {
  const [orders, paymentsIn, purchaseOrders, paymentsOut] = await Promise.all([
    prisma.order.findMany({ where: { orgId, clientId }, include: { lineItems: true } }),
    prisma.payment.aggregate({
      where: { orgId, counterpartyId: clientId, direction: "IN" },
      _sum: { amount: true },
    }),
    prisma.purchaseOrder.findMany({
      where: { orgId, supplierId: clientId },
      include: { lineItems: true },
    }),
    prisma.payment.aggregate({
      where: { orgId, counterpartyId: clientId, direction: "OUT" },
      _sum: { amount: true },
    }),
  ]);

  const orderedTotal = orders.reduce(
    (sum, o) =>
      sum + o.lineItems.reduce((s, li) => s + Number(li.unitPriceSnapshot) * Number(li.quantity), 0),
    0,
  );
  const purchasedTotal = purchaseOrders.reduce(
    (sum, po) =>
      sum + po.lineItems.reduce((s, li) => s + Number(li.unitPriceSnapshot) * Number(li.quantity), 0),
    0,
  );

  return {
    receivable: orderedTotal - Number(paymentsIn._sum.amount ?? 0),
    payable: purchasedTotal - Number(paymentsOut._sum.amount ?? 0),
  };
}

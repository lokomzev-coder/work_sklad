import { prisma } from "@/lib/prisma";
import { getLatestRates, getOrgBaseCurrency, toBase } from "@/lib/currency";

export interface ClientBalance {
  /** What this counterparty owes us: their orders' total minus payments IN. */
  receivable: number;
  /** What we owe this counterparty as a supplier: their purchase orders'
   * total minus payments OUT. */
  payable: number;
  baseCurrency: string;
}

/**
 * A minimal "who owes whom" view — enough to answer the practical question
 * without modeling full invoices yet (ROADMAP Block C3 follow-up). A Client
 * can be both a customer (orders) and a supplier (purchase orders), so the
 * two balances are tracked independently rather than netted together.
 * Amounts are converted to the org's base currency (lib/currency.ts).
 */
export async function getClientBalance(orgId: string, clientId: string): Promise<ClientBalance> {
  const [orders, paymentsIn, purchaseOrders, paymentsOut, baseCurrency, rates] = await Promise.all([
    prisma.order.findMany({ where: { orgId, clientId }, include: { lineItems: true } }),
    prisma.payment.findMany({
      where: { orgId, counterpartyId: clientId, direction: "IN" },
      select: { amount: true, currency: true },
    }),
    prisma.purchaseOrder.findMany({
      where: { orgId, supplierId: clientId },
      include: { lineItems: true },
    }),
    prisma.payment.findMany({
      where: { orgId, counterpartyId: clientId, direction: "OUT" },
      select: { amount: true, currency: true },
    }),
    getOrgBaseCurrency(orgId),
    getLatestRates(orgId),
  ]);

  const convert = (amount: number, currency: string) => toBase(rates, baseCurrency, amount, currency);

  const orderedTotal = orders.reduce(
    (sum, o) =>
      sum + o.lineItems.reduce((s, li) => s + convert(Number(li.unitPriceSnapshot) * Number(li.quantity), li.currency), 0),
    0,
  );
  const purchasedTotal = purchaseOrders.reduce(
    (sum, po) =>
      sum + po.lineItems.reduce((s, li) => s + convert(Number(li.unitPriceSnapshot) * Number(li.quantity), li.currency), 0),
    0,
  );
  const paymentsInTotal = paymentsIn.reduce((sum, p) => sum + convert(Number(p.amount), p.currency), 0);
  const paymentsOutTotal = paymentsOut.reduce((sum, p) => sum + convert(Number(p.amount), p.currency), 0);

  return {
    receivable: orderedTotal - paymentsInTotal,
    payable: purchasedTotal - paymentsOutTotal,
    baseCurrency,
  };
}

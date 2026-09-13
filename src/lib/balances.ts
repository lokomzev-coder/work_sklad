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
  const [orders, paymentsIn, purchaseOrders, paymentsOut, baseCurrency, rates, adjustments] = await Promise.all([
    prisma.order.findMany({ where: { orgId, clientId }, include: { lineItems: true } }),
    prisma.payment.findMany({
      where: { orgId, counterpartyId: clientId, direction: "IN" },
      select: { amount: true, currency: true, rateSnapshot: true },
    }),
    prisma.purchaseOrder.findMany({
      where: { orgId, supplierId: clientId },
      include: { lineItems: true },
    }),
    prisma.payment.findMany({
      where: { orgId, counterpartyId: clientId, direction: "OUT" },
      select: { amount: true, currency: true, rateSnapshot: true },
    }),
    getOrgBaseCurrency(orgId),
    getLatestRates(orgId),
    // Block O phase 6: manual corrections (debt forgiveness, opening-balance
    // migration) — see CounterpartyAdjustment's schema comment. Assumed
    // already in base currency (no currency field on the model — same
    // simplification as the rest of this "minimal ledger" file's todos).
    prisma.counterpartyAdjustment.findMany({ where: { orgId, clientId }, select: { side: true, amount: true } }),
  ]);

  // orderedTotal/purchasedTotal (OrderLineItem/PurchaseOrderLineItem-based)
  // stay on today's rate — see ROADMAP Block M2's documented scope boundary.
  // convertPayment (Block M2) prefers each Payment's own rateSnapshot.
  const convert = (amount: number, currency: string) => toBase(rates, baseCurrency, amount, currency);
  const convertPayment = (amount: number, currency: string, rateSnapshot: unknown) =>
    toBase(rates, baseCurrency, amount, currency, rateSnapshot ? Number(rateSnapshot) : null);

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
  const paymentsInTotal = paymentsIn.reduce(
    (sum, p) => sum + convertPayment(Number(p.amount), p.currency, p.rateSnapshot),
    0,
  );
  const paymentsOutTotal = paymentsOut.reduce(
    (sum, p) => sum + convertPayment(Number(p.amount), p.currency, p.rateSnapshot),
    0,
  );

  const receivableAdjustments = adjustments
    .filter((a) => a.side === "RECEIVABLE")
    .reduce((sum, a) => sum + Number(a.amount), 0);
  const payableAdjustments = adjustments
    .filter((a) => a.side === "PAYABLE")
    .reduce((sum, a) => sum + Number(a.amount), 0);

  return {
    receivable: orderedTotal - paymentsInTotal - receivableAdjustments,
    payable: purchasedTotal - paymentsOutTotal - payableAdjustments,
    baseCurrency,
  };
}

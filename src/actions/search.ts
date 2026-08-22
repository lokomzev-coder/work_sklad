"use server";

import { prisma } from "@/lib/prisma";
import { getOrgContext } from "@/lib/tenant";

export interface SearchResultItem {
  id: string;
  label: string;
  sublabel?: string;
  href: string;
}

export interface SearchResults {
  employees: SearchResultItem[];
  clients: SearchResultItem[];
  catalogItems: SearchResultItem[];
  orders: SearchResultItem[];
}

const RESULTS_PER_GROUP = 5;

export async function searchOrg(
  orgSlug: string,
  query: string,
): Promise<SearchResults> {
  const ctx = await getOrgContext(orgSlug);
  const trimmed = query.trim();

  if (trimmed.length === 0) {
    return { employees: [], clients: [], catalogItems: [], orders: [] };
  }

  const orderNumber = Number(trimmed);
  const isOrderNumber = Number.isInteger(orderNumber) && orderNumber > 0;

  const [employees, clients, catalogItems, orders] = await Promise.all([
    prisma.employee.findMany({
      where: {
        orgId: ctx.orgId,
        status: "ACTIVE",
        fullName: { contains: trimmed, mode: "insensitive" },
      },
      take: RESULTS_PER_GROUP,
    }),
    prisma.client.findMany({
      where: {
        orgId: ctx.orgId,
        status: "ACTIVE",
        name: { contains: trimmed, mode: "insensitive" },
      },
      take: RESULTS_PER_GROUP,
    }),
    prisma.catalogItem.findMany({
      where: {
        orgId: ctx.orgId,
        status: "ACTIVE",
        name: { contains: trimmed, mode: "insensitive" },
      },
      take: RESULTS_PER_GROUP,
    }),
    isOrderNumber
      ? prisma.order.findMany({
          where: { orgId: ctx.orgId, number: orderNumber },
          include: { client: true },
          take: RESULTS_PER_GROUP,
        })
      : Promise.resolve([]),
  ]);

  return {
    employees: employees.map((e) => ({
      id: e.id,
      label: e.fullName,
      sublabel: e.position ?? undefined,
      href: `/${orgSlug}/employees/${e.id}`,
    })),
    clients: clients.map((c) => ({
      id: c.id,
      label: c.name,
      sublabel: c.inn ?? undefined,
      href: `/${orgSlug}/clients/${c.id}`,
    })),
    catalogItems: catalogItems.map((c) => ({
      id: c.id,
      label: c.name,
      sublabel: `${c.unitPrice.toString()} ${c.currency}`,
      href: `/${orgSlug}/catalog/${c.id}`,
    })),
    orders: orders.map((o) => ({
      id: o.id,
      label: `Заказ №${o.number}`,
      sublabel: o.client?.name,
      href: `/${orgSlug}/orders/${o.id}`,
    })),
  };
}

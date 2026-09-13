import { prisma } from "@/lib/prisma";

/**
 * Block E: Payment.counterpartyId is not nullable, but a walk-in retail
 * sale often has no real client. Finds (or creates once) the org's single
 * "Розничный покупатель" placeholder Client. Find-first-then-create, no
 * unique constraint — the same tolerance for a rare create-race already
 * accepted elsewhere in this project (a duplicate here is mild: two
 * placeholder rows, never data corruption).
 */
export async function getOrCreateWalkInClient(orgId: string): Promise<string> {
  const existing = await prisma.client.findFirst({
    where: { orgId, isWalkIn: true },
    select: { id: true },
  });
  if (existing) return existing.id;

  const created = await prisma.client.create({
    data: { orgId, name: "Розничный покупатель", isWalkIn: true },
  });
  return created.id;
}

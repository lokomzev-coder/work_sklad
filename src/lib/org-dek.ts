import { prisma } from "@/lib/prisma";
import { generateDek, wrapDek, unwrapDek } from "@/lib/crypto";

/**
 * Ensures an organization has a wrapped DEK, generating one if it predates
 * the vault feature (e.g. orgs created before Phase 7). Idempotent: the
 * `updateMany` only writes when encDekWrapped is still null, so a race
 * between two callers just means one write wins and the other is a no-op.
 */
async function ensureOrgDek(orgId: string): Promise<void> {
  const org = await prisma.organization.findUniqueOrThrow({
    where: { id: orgId },
    select: { encDekWrapped: true, encDekNonce: true },
  });
  if (org.encDekWrapped && org.encDekNonce) return;

  const dek = generateDek();
  const { wrapped, nonce } = wrapDek(dek);
  await prisma.organization.updateMany({
    where: { id: orgId, encDekWrapped: null },
    data: { encDekWrapped: wrapped, encDekNonce: nonce },
  });
}

/** Returns the organization's unwrapped DEK, generating one first if missing. */
export async function getOrgDek(orgId: string): Promise<Buffer> {
  await ensureOrgDek(orgId);
  const org = await prisma.organization.findUniqueOrThrow({
    where: { id: orgId },
    select: { encDekWrapped: true, encDekNonce: true },
  });
  if (!org.encDekWrapped || !org.encDekNonce) {
    throw new Error("Organization encryption key could not be initialized");
  }
  return unwrapDek(org.encDekWrapped, org.encDekNonce);
}

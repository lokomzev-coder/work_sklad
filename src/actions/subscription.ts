"use server";

import { revalidatePath } from "next/cache";
import { getOrgContext } from "@/lib/tenant";
import { createOrDraftInvoice, type InvoiceSelection } from "@/lib/billing/subscription-billing";

export interface SubscriptionActionResult {
  error?: string;
  settled?: boolean;
}

/**
 * Блок Q — self-service purchase: picking a fixed plan or submitting a
 * "Свой тариф" selection both come through here. Deliberately does NOT
 * call assertPermission — gated on ctx.role === "ADMIN" directly (same
 * bar the read-only version of this page already used) so a RESTRICTED
 * org can still pay its way out of RESTRICTED; routing this through the
 * subscription-gated assertPermission would be a deadlock.
 */
export async function purchaseSubscriptionAction(
  orgSlug: string,
  selection: InvoiceSelection,
): Promise<SubscriptionActionResult> {
  const ctx = await getOrgContext(orgSlug);
  if (ctx.role !== "ADMIN") {
    return { error: "Только администратор организации может оформлять подписку" };
  }

  const result = await createOrDraftInvoice(ctx.orgId, selection);
  if (result.error) {
    return { error: result.error };
  }

  revalidatePath(`/${orgSlug}/settings/subscription`);
  return { settled: result.settled };
}

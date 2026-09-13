import { NextResponse, type NextRequest } from "next/server";
import { runSubscriptionRenewals } from "@/lib/billing/subscription-billing";
import { verifyCronRequest } from "@/lib/cron-auth";

/**
 * Блок Q — same external-scheduler-driven pattern as
 * /api/cron/webhook-retries and /api/cron/fiscal-status, same auth
 * (lib/cron-auth.ts). Run daily: retries balance-funded auto-renewal for
 * every organization whose paid plan has reached its expiry date — see
 * lib/billing/subscription-billing.ts::runSubscriptionRenewals for what
 * actually happens (GRACE/RESTRICTED themselves need no action here, they
 * fall out of resolveSubscriptionState purely from the dates involved).
 */
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const authError = verifyCronRequest(request);
  if (authError) return authError;

  const result = await runSubscriptionRenewals();
  return NextResponse.json(result);
}

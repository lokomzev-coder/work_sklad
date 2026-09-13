import { NextResponse, type NextRequest } from "next/server";
import { pollPendingFiscalReceipts } from "@/lib/fiscal/register-fiscal-receipt";
import { verifyCronRequest } from "@/lib/cron-auth";

/**
 * Block E — same external-scheduler-driven pattern as
 * /api/cron/webhook-retries (Block M3), same auth convention (CRON_SECRET
 * bearer token, extracted to lib/cron-auth.ts in Block Q). See that
 * route's comment for the full reasoning.
 */
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const authError = verifyCronRequest(request);
  if (authError) return authError;

  const result = await pollPendingFiscalReceipts();
  return NextResponse.json(result);
}

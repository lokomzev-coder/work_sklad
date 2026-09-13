import { NextResponse, type NextRequest } from "next/server";
import { retryPendingDeliveries } from "@/lib/webhooks";
import { verifyCronRequest } from "@/lib/cron-auth";

/**
 * Block M3 — driven by an external scheduler (deploy platform still
 * undecided, see ROADMAP Block L), not by anything running inside this
 * process. GET is deliberate, not a REST-style choice: it's the method
 * Vercel Cron (and most other schedulers) actually send, and this route has
 * no meaningful "resource" to model — it's a trigger, not a query.
 * `force-dynamic` keeps Next.js from ever considering this cacheable.
 *
 * Auth: a bearer token compared against CRON_SECRET, read from the
 * Authorization header (not a query string, which can end up in proxy/
 * referrer logs) — this is exactly the header Vercel Cron sends when
 * CRON_SECRET is configured, so this route matches that convention whether
 * or not Vercel ends up being the chosen host. In production the route
 * refuses to run at all if CRON_SECRET isn't set (fail closed); in dev the
 * check is skipped when the var is absent, for convenience calling this
 * locally.
 */
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const authError = verifyCronRequest(request);
  if (authError) return authError;

  const result = await retryPendingDeliveries();
  return NextResponse.json(result);
}

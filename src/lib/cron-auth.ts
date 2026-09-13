import { createHash, timingSafeEqual } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";

/**
 * Блок Q — extracted out of webhook-retries/fiscal-status's routes (which
 * had this exact ~15-line check duplicated verbatim, each explicitly
 * pointing at the other as "the" reference implementation) when a third
 * cron route needed the same thing — three independent copies is a smell,
 * two wasn't quite enough to bother yet.
 *
 * Auth: a bearer token compared against CRON_SECRET, read from the
 * Authorization header (not a query string, which can end up in proxy/
 * referrer logs) — this is exactly the header Vercel Cron sends when
 * CRON_SECRET is configured. In production, a request is refused if
 * CRON_SECRET isn't set at all (fail closed); in dev the check is skipped
 * when the var is absent, for convenience calling these locally.
 *
 * Returns a NextResponse to return immediately if the request should be
 * rejected, or null if it's authorized and the route should proceed.
 */
export function verifyCronRequest(request: NextRequest): NextResponse | null {
  const secret = process.env.CRON_SECRET;

  if (process.env.NODE_ENV === "production" && !secret) {
    return NextResponse.json({ error: "CRON_SECRET is not configured" }, { status: 500 });
  }

  if (secret) {
    const auth = request.headers.get("authorization") ?? "";
    if (!safeEqual(auth, `Bearer ${secret}`)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  return null;
}

function safeEqual(a: string, b: string): boolean {
  const hashA = createHash("sha256").update(a).digest();
  const hashB = createHash("sha256").update(b).digest();
  return timingSafeEqual(hashA, hashB);
}

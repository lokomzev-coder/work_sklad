/**
 * Block M4 phase B — the ONLY origin the server-side PDF renderer is ever
 * allowed to point its headless browser at. Deliberately never derived from
 * the incoming request (`request.nextUrl.origin`, or a `Host`/`X-Forwarded-
 * Host` header) — without a proxy that strips/validates those, they're
 * attacker-controlled, and using either here would let anyone redirect the
 * server's own headless browser at an arbitrary internal or external URL
 * (SSRF) just by setting a header. Same fail-closed-in-production shape as
 * `verifyCronRequest` (lib/cron-auth.ts): required in production, falls
 * back to localhost for local dev convenience.
 */
export function getInternalAppOrigin(): string {
  const origin = process.env.INTERNAL_APP_ORIGIN;
  if (origin) return origin;
  if (process.env.NODE_ENV === "production") {
    throw new Error("INTERNAL_APP_ORIGIN is not configured");
  }
  return "http://localhost:3000";
}

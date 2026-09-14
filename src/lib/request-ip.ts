/** Shared by lib/auth.ts and lib/admin-auth.ts's Credentials `authorize()`
 * — both need the caller's IP for rate limiting, neither trusts anything
 * beyond the first `X-Forwarded-For` hop (the proxy/load balancer in front
 * of this app is what actually sets that header; anything after the first
 * entry is client-appended and unverifiable). */
export function getClientIp(request: Request | undefined): string {
  const forwardedFor = request?.headers.get("x-forwarded-for");
  if (forwardedFor) return forwardedFor.split(",")[0].trim();
  return "unknown";
}

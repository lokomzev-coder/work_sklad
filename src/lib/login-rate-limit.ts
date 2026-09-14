/**
 * Security fix (external review, 2026-09-13) — the org login had no rate
 * limiting at all, unlike lib/admin-rate-limit.ts's stricter one for the
 * platform panel. That earlier choice reasoned the panel is worth more per
 * account compromised (reaches every org at once); the org login is the
 * far larger attack surface in absolute terms — every employee of every
 * organization authenticates through it — so both get a limiter, just
 * tuned differently: looser here, since real users mistyping a password
 * happens constantly across a userbase this size, unlike the tiny handful
 * of platform admins. Same in-memory sliding-window idiom as
 * lib/admin-rate-limit.ts/lib/api-rate-limit.ts.
 */
const WINDOW_MS = 15 * 60 * 1000;
const MAX_ATTEMPTS_PER_WINDOW = 10;

const attempts = new Map<string, number[]>();

export interface LoginRateLimitResult {
  allowed: boolean;
  remaining: number;
}

/** Keyed by `loginId:ip` (loginId is already "login@orgSlug", so this is
 * effectively per-account-per-source, same reasoning as the admin
 * limiter's `email:ip`). */
export function checkLoginRateLimit(loginId: string, ip: string): LoginRateLimitResult {
  const key = `${loginId.toLowerCase()}:${ip}`;
  const now = Date.now();
  const recent = (attempts.get(key) ?? []).filter((t) => now - t < WINDOW_MS);
  const allowed = recent.length < MAX_ATTEMPTS_PER_WINDOW;
  recent.push(now);
  attempts.set(key, recent);
  return { allowed, remaining: Math.max(0, MAX_ATTEMPTS_PER_WINDOW - recent.length) };
}

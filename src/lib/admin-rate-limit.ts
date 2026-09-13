/**
 * Блок L — rate limiting for `/admin/login` specifically, separate from and
 * stricter than the org login (`lib/auth.ts` has none at all yet — this is
 * deliberately only for the platform panel, whose target is worth far more
 * to an attacker: one compromised account reaches every organization's
 * data at once, not just one). Same in-memory sliding-window idiom as
 * `lib/api-rate-limit.ts` (Block O) — per-process only, documented there
 * already; acceptable for this project's single-instance deployment.
 */
const WINDOW_MS = 15 * 60 * 1000;
const MAX_ATTEMPTS_PER_WINDOW = 5;

const attempts = new Map<string, number[]>();

export interface AdminRateLimitResult {
  allowed: boolean;
  remaining: number;
}

/** Keyed by `email:ip` — a single attacker hammering many emails from one
 * IP, or one email from many IPs, both still eventually throttle (the
 * email half alone would already stop a single-account brute force; the
 * IP half is defense against credential stuffing across many admin
 * emails, which barely exist here — there's normally only a handful of
 * platform admins total). */
export function checkAdminLoginRateLimit(email: string, ip: string): AdminRateLimitResult {
  const key = `${email.toLowerCase()}:${ip}`;
  const now = Date.now();
  const recent = (attempts.get(key) ?? []).filter((t) => now - t < WINDOW_MS);
  const allowed = recent.length < MAX_ATTEMPTS_PER_WINDOW;
  recent.push(now);
  attempts.set(key, recent);
  return { allowed, remaining: Math.max(0, MAX_ATTEMPTS_PER_WINDOW - recent.length) };
}

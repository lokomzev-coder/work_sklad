/**
 * Block O — per-API-key rate limiting for /api/v1/*. In-memory sliding
 * window, module-level Map: no Redis in this project, so this is
 * per-process only — fine for a single dev/small-prod Next.js instance,
 * but a multi-instance deployment would need a shared store instead
 * (documented in docs/handbook/api/errors-and-limits.md, not silently
 * pretended away).
 */
const WINDOW_MS = 3000;
const MAX_REQUESTS_PER_WINDOW = 45;

const hits = new Map<string, number[]>();

export interface RateLimitResult {
  allowed: boolean;
  limit: number;
  remaining: number;
}

export function checkRateLimit(apiKeyId: string): RateLimitResult {
  const now = Date.now();
  const recent = (hits.get(apiKeyId) ?? []).filter((t) => now - t < WINDOW_MS);
  const allowed = recent.length < MAX_REQUESTS_PER_WINDOW;
  if (allowed) recent.push(now);
  hits.set(apiKeyId, recent);
  return {
    allowed,
    limit: MAX_REQUESTS_PER_WINDOW,
    remaining: Math.max(0, MAX_REQUESTS_PER_WINDOW - recent.length),
  };
}

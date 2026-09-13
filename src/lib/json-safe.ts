/** Recursively converts Prisma's Decimal/Date/BigInt values (and anything
 * else with a `toFixed`-like shape) into plain JSON-safe values. Shared by
 * lib/api-response.ts (API responses) and lib/audit-log.ts (diff storage) —
 * both need the same "make a Prisma row safe to JSON.stringify" step. */
export function toJsonSafe<T>(value: T): T {
  return JSON.parse(
    JSON.stringify(value, (_key, v) => {
      if (v && typeof v === "object" && typeof (v as { toFixed?: unknown }).toFixed === "function") {
        return (v as { toString(): string }).toString();
      }
      return v;
    }),
  );
}

import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";
import { PrismaClient } from "@/generated/prisma/client";
import { createAuditLogExtension } from "@/lib/audit-log";

function createBasePrismaClient() {
  // `prisma dev`'s local database is PGlite — Postgres compiled to WASM,
  // running as a single process. Real Postgres forks a backend process per
  // connection; WASM can't fork at all, so this engine architecturally
  // accepts exactly ONE connection at a time — every other connection
  // attempt queues behind it (confirmed via Prisma's own docs and
  // independent write-ups, not a guess). A pool sized for a real Postgres
  // server (this was previously 20, raised from pg's default 10 to survive
  // a heavy page's own multi-query burst) instead opens several connections
  // at once against an engine that can only ever grant one — under
  // Turbopack's cold-start burst this reliably crashed the whole
  // `prisma dev` process outright rather than gracefully queuing. `max: 1`
  // makes this pool behave the way the engine actually works in dev: every
  // query in that process serializes through one real connection.
  //
  // Production (Block T deploy, 2026-09-15) runs against a real Postgres in
  // its own container, not `prisma dev` — the single-connection constraint
  // above doesn't apply there, and serializing every query through one
  // connection would be a severe, self-inflicted concurrency bottleneck.
  const isRealPostgres = process.env.NODE_ENV === "production";
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    max: isRealPostgres ? 10 : 1,
    // `next dev` (Turbopack) runs the actual route/RSC work in a separate
    // OS process from the main CLI process — confirmed experimentally (each
    // logged a different process.pid creating its own PrismaClient). Since
    // PGlite only ever grants ONE connection system-wide, not per-process,
    // holding this process's connection open indefinitely (as an earlier
    // attempt at this fix did, via an eager instrumentation.ts warmup with
    // no idle timeout) starves every OTHER process of that same one slot —
    // actively made the cross-process collision worse, not better. A short
    // idle timeout releases the slot quickly when this process isn't
    // actively querying, so it doesn't monopolize the only connection
    // `prisma dev` can ever hand out. Real Postgres has no such single-slot
    // constraint, so production gets a normal, longer idle timeout instead.
    idleTimeoutMillis: isRealPostgres ? 30_000 : 3_000,
    keepAlive: true,
  });
  // Without an 'error' listener, pg's Pool crashes the whole Node process
  // when an idle client's connection is dropped server-side — this just
  // logs it so a stale connection surfaces as a normal query error instead.
  pool.on("error", (err) => {
    console.error("[pg pool] idle client error", err);
  });
  const adapter = new PrismaPg(pool);
  return new PrismaClient({ adapter });
}

// Block O phase 3: wraps the base client with the audit-log extension
// (lib/audit-log.ts) — `base` is kept in closure so the extension can read
// pre-mutation state and write AuditLog rows through the *unextended*
// client, never recursing through its own interception logic.
function createPrismaClient() {
  const base = createBasePrismaClient();
  return base.$extends(createAuditLogExtension(base));
}

type AppPrismaClient = ReturnType<typeof createPrismaClient>;

const globalForPrisma = globalThis as unknown as {
  prisma: AppPrismaClient | undefined;
};

export const prisma = globalForPrisma.prisma ?? createPrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}

/**
 * The type `$transaction`'s callback actually receives at runtime for this
 * (now audit-log-extended) client. Prisma's own generated `Prisma.
 * TransactionClient` type describes the *unextended* client's shape and is
 * no longer structurally assignable once `prisma` carries an extension —
 * every `prisma.$transaction(async (tx: Tx) => ...)` call site (lib/
 * orders.ts, lib/stock-batches.ts) must use this instead of `Prisma.
 * TransactionClient` directly, or `tsc` fails at each call site.
 */
export type Tx = Omit<AppPrismaClient, "$connect" | "$disconnect" | "$on" | "$transaction" | "$use" | "$extends">;

// Confirmed experimentally (temporary per-process/globalThis-id logging in
// createBasePrismaClient, later removed): `next dev` with Turbopack runs the
// route handler and at least one other internal path (render/HMR worker) in
// genuinely separate OS processes, each lazily creating its OWN PrismaClient
// on first use — the globalThis singleton guard below only dedupes within
// ONE process, it cannot and does not span processes. `prisma dev`'s local
// database is PGlite (Postgres compiled to WASM, single process, no fork —
// see the pool comment above) and only ever grants ONE live connection;
// two separate Next.js processes each opening their first connection within
// milliseconds of each other is enough to crash the whole `prisma dev`
// instance outright (not just queue the second one) — reproduced this exact
// way, not a guess. Prisma's PrismaClientKnownRequestError passes the
// underlying OS/socket error code straight through as `.code` when it isn't
// one of Prisma's own P-codes — `EACCES` is what that collision surfaces as.
// The original message-only regex below never matched it (no "connection"/
// "terminated"/"closed" substring in an EACCES message), so `withDbRetry`
// silently never retried this — the most common failure of all, since it
// fires on literally the first request after every `prisma dev` restart.
const TRANSIENT_ERROR_CODES = new Set(["EACCES", "ECONNREFUSED", "ECONNRESET", "ETIMEDOUT"]);

function isTransientConnectionError(err: unknown): boolean {
  const code = (err as { code?: unknown } | null)?.code;
  if (typeof code === "string" && TRANSIENT_ERROR_CODES.has(code)) return true;
  const message = err instanceof Error ? err.message : String(err);
  return /connection|terminated|closed/i.test(message);
}

/**
 * Retries `fn` up to 4 more times (5 attempts total), with increasing
 * jittered delay, if it fails with a transient connection error (see the
 * pool comment above, and TRANSIENT_ERROR_CODES's comment for the confirmed
 * two-process cold-start collision this specifically exists to survive).
 * The delays are deliberately longer and jittered (±40%) compared to a
 * typical retry helper — the two colliding processes each independently
 * retrying on the exact same fixed schedule would just keep re-colliding
 * (a classic thundering-herd pattern); randomizing the wait makes it likely
 * one of them lands in a gap where the other's connection is idle. Only
 * wrap call sites that are safe to re-run verbatim — read-only batches (a
 * page's data-fetching `Promise.all`), never a mutation or `$transaction`,
 * since a write whose connection dropped after the server already committed
 * it would be double-applied on retry.
 */
export async function withDbRetry<T>(fn: () => Promise<T>): Promise<T> {
  const baseDelaysMs = [200, 500, 1000, 2000];
  for (let attempt = 0; ; attempt++) {
    try {
      return await fn();
    } catch (err) {
      if (!isTransientConnectionError(err) || attempt >= baseDelaysMs.length) throw err;
      const base = baseDelaysMs[attempt];
      const jittered = base + (Math.random() * 0.8 - 0.4) * base;
      await new Promise((resolve) => setTimeout(resolve, jittered));
    }
  }
}

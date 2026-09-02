import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";
import { PrismaClient } from "@/generated/prisma/client";

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

function createPrismaClient() {
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    // pg's own default (10) is too easy to exhaust: a single heavy page
    // (e.g. the dashboard's ~9-query Promise.all) can alone reach it, and
    // any concurrent request from another tab/org on the same dev server
    // then queues or fails outright with "Server has closed the
    // connection" / DriverAdapterError ConnectionClosed. Room to breathe.
    max: 20,
    // `prisma dev`'s local proxy recycles idle sockets more aggressively than
    // pg's own defaults expect, so a pooled connection can go stale
    // server-side while pg still thinks it's usable — the next query on it
    // then fails with "Connection terminated unexpectedly". Recycling idle
    // clients client-side sooner shrinks that staleness window, and
    // keepAlive stops network-level middleboxes from silently dropping the
    // socket. None of this is needed against a real always-on Postgres, but
    // it's harmless there too.
    idleTimeoutMillis: 10_000,
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

export const prisma = globalForPrisma.prisma ?? createPrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}

function isTransientConnectionError(err: unknown): boolean {
  const message = err instanceof Error ? err.message : String(err);
  return /connection|terminated|closed/i.test(message);
}

/**
 * Retries `fn` once, after a short delay, if it fails with a transient
 * connection-drop error (see the pool comments above — `prisma dev`'s local
 * proxy can recycle a socket out from under an in-flight query even with
 * `max`/`idleTimeoutMillis` tuned). Only wrap call sites that are safe to
 * re-run verbatim — read-only batches (a page's data-fetching
 * `Promise.all`), never a mutation or `$transaction`, since a write whose
 * connection dropped after the server already committed it would be
 * double-applied on retry.
 */
export async function withDbRetry<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    if (!isTransientConnectionError(err)) throw err;
    await new Promise((resolve) => setTimeout(resolve, 150));
    return fn();
  }
}

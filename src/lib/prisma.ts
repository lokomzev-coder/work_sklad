import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";
import { PrismaClient } from "@/generated/prisma/client";

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

function createPrismaClient() {
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
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

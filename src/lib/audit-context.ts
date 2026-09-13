import { AsyncLocalStorage } from "node:async_hooks";

/**
 * Block O phase 3 — audit log. The Prisma Client Extension that actually
 * writes AuditLog rows (lib/audit-log.ts) reads "who's asking" from here.
 *
 * IMPORTANT, found experimentally while building this: `enterWith()` does
 * NOT survive an intervening `await prisma.*` call in this project's stack
 * (Prisma 7 + `@prisma/adapter-pg`, Next.js 16 dev/Turbopack) — confirmed by
 * direct experiment, not assumed. Calling `setAuditActor` once at the top of
 * a request (e.g. inside `getOrgContext`) and then doing even one more
 * `await prisma.something(...)` before the audited mutation is enough to
 * lose the context; `getCurrentAuditActor()` at that point reads back
 * `undefined`. Only calling `setAuditActor` as the LAST synchronous step
 * immediately before the audited `create`/`update`/`delete` — with no
 * Prisma call in between — was reliable in testing.
 *
 * Consequence: this actually provides reliable coverage only where a call
 * site sets the actor right next to its mutation. That's true for the two
 * /api/v1/entity route handlers (lib/api-guard.ts's `guardApiRequest`
 * result is used to call `setAuditActor` again immediately before each
 * `delegate.create/update/delete`) — verified working end to end. It is
 * NOT reliably true for `getOrgContext` (lib/tenant.ts), which every
 * dashboard Server Action calls once, often several Prisma queries before
 * its actual mutation — so **dashboard/UI-triggered changes are not
 * reliably captured by this audit log in this version**. That's a real,
 * documented scope gap (see ROADMAP.md Block O phase 3), not a silent one:
 * closing it needs either each dashboard action to call `setAuditActor`
 * itself right before its mutation (touches ~50 files, not done here), or
 * root-causing why Prisma's own query execution doesn't preserve
 * AsyncLocalStorage context (worth re-testing against a production build
 * and newer Prisma/Next releases before assuming it's permanent).
 */
export interface AuditActor {
  orgId: string;
  source: "UI" | "API";
  userId?: string;
  /** Human-readable snapshot (name/email, or "API-ключ: <name>") — stored
   * on the AuditLog row itself so it stays meaningful even after the user
   * is removed or the key is revoked. */
  label: string;
}

// Cached on `globalThis`, same defensive pattern as lib/prisma.ts's own
// `globalForPrisma` (Next.js/Turbopack dev can re-evaluate a shared leaf
// module more than once across different route bundles) — harmless whether
// or not that's the actual cause of the propagation issue described above.
const globalForAudit = globalThis as unknown as { auditActorStorage: AsyncLocalStorage<AuditActor> | undefined };
const storage = globalForAudit.auditActorStorage ?? new AsyncLocalStorage<AuditActor>();
globalForAudit.auditActorStorage = storage;

/** Sets the actor for whatever Prisma call happens next, with NO other
 * `await prisma.*` in between — see this module's doc comment. */
export function setAuditActor(actor: AuditActor): void {
  storage.enterWith(actor);
}

export function getCurrentAuditActor(): AuditActor | undefined {
  return storage.getStore();
}

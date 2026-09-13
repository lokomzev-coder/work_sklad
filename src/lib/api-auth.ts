import { prisma, withDbRetry } from "@/lib/prisma";
import { hashApiKey } from "@/lib/api-keys";
import { setAuditActor } from "@/lib/audit-context";

export interface ApiAuthContext {
  orgId: string;
  apiKeyId: string;
  /** Pre-built "API-ключ: <name>" label — route handlers pass this straight
   * to `setAuditActor` immediately before their own mutating call (see
   * lib/audit-context.ts's doc comment for why "immediately before", not
   * once up front here). */
  actorLabel: string;
}

/**
 * Resolves `Authorization: Bearer <key>` into the organization it belongs
 * to. Returns null for anything that doesn't check out (missing header,
 * unknown key, revoked key) — callers respond 401, never distinguishing
 * *why* to an unauthenticated caller (same principle as a login form never
 * saying "wrong password" vs "no such user").
 */
export async function resolveApiAuth(request: Request): Promise<ApiAuthContext | null> {
  const header = request.headers.get("authorization") ?? "";
  const match = /^Bearer\s+(.+)$/i.exec(header.trim());
  if (!match) return null;

  // withDbRetry (lib/prisma.ts): the local `prisma dev` proxy can drop a
  // connection under a burst of concurrent requests — this auth check runs
  // on every single /api/v1/* call, so it's the single most-hit query path
  // in the whole public API, an even bigger real-world risk than any one
  // dashboard page. Safe here, purely read-only.
  const key = await withDbRetry(() =>
    prisma.apiKey.findUnique({
      where: { keyHash: hashApiKey(match[1].trim()) },
      select: { id: true, orgId: true, revokedAt: true, name: true },
    }),
  );
  if (!key || key.revokedAt) return null;

  // Fire-and-forget, same non-blocking pattern as
  // lib/fiscal/register-fiscal-receipt.ts — a slow/failed write to
  // lastUsedAt must never delay or fail the actual API response.
  prisma.apiKey.update({ where: { id: key.id }, data: { lastUsedAt: new Date() } }).catch(() => {});

  const actorLabel = `API-ключ: ${key.name}`;
  // Best-effort priming — reliable only if nothing else awaits a Prisma
  // call before the audited mutation (see lib/audit-context.ts). Route
  // handlers additionally call setAuditActor again immediately before
  // their own create/update/delete, which is what actually guarantees it.
  setAuditActor({ orgId: key.orgId, source: "API", label: actorLabel });

  return { orgId: key.orgId, apiKeyId: key.id, actorLabel };
}

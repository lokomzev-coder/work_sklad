import { NextResponse } from "next/server";
import { withDbRetry } from "@/lib/prisma";
import { setAuditActor } from "@/lib/audit-context";
import { getDelegate, projectRow, coerceForWrite } from "@/lib/api-registry";
import { parseExpandOnly } from "@/lib/api-query";
import { entityResponse, errorResponse, buildHref } from "@/lib/api-response";
import { guardApiRequest, withRateLimitHeaders } from "@/lib/api-guard";

export const dynamic = "force-dynamic";

// withDbRetry: see api-auth.ts's comment — same connection-burst risk. Safe
// to retry even when this precedes a PUT/DELETE mutation below, since the
// lookup itself is read-only and idempotent.
async function findOwned(delegate: ReturnType<typeof getDelegate>, orgId: string, id: string, include?: Record<string, unknown>) {
  return withDbRetry(() => delegate.findFirst({ where: { id, orgId }, include }));
}

export async function GET(request: Request, { params }: { params: Promise<{ type: string; id: string }> }) {
  const { type, id } = await params;
  const guard = await guardApiRequest(request, type);
  if (!guard.ok) return guard.response;
  const { auth, config, rateLimit } = guard;

  const url = new URL(request.url);
  const expandRaw = url.searchParams.get("expand");
  let include: Record<string, unknown> | undefined;
  if (expandRaw) {
    const result = parseExpandOnly(expandRaw, config);
    if (!result.ok) {
      return withRateLimitHeaders(errorResponse(400, result.error, { parameter: "expand" }), rateLimit);
    }
    include = result.include;
  }

  const delegate = getDelegate(config);
  const row = await findOwned(delegate, auth.orgId, id, include);
  if (!row) {
    return withRateLimitHeaders(errorResponse(404, "Запись не найдена"), rateLimit);
  }

  return withRateLimitHeaders(entityResponse(projectRow(row, config), type, buildHref(request, url.pathname)), rateLimit);
}

export async function PUT(request: Request, { params }: { params: Promise<{ type: string; id: string }> }) {
  const { type, id } = await params;
  const guard = await guardApiRequest(request, type);
  if (!guard.ok) return guard.response;
  const { auth, config, rateLimit } = guard;

  if (!config.writable) {
    return withRateLimitHeaders(
      errorResponse(405, `Обновление "${type}" через API пока не поддерживается — см. docs/handbook/api/README.md`),
      rateLimit,
    );
  }

  const delegate = getDelegate(config);
  const existing = await findOwned(delegate, auth.orgId, id);
  if (!existing) {
    return withRateLimitHeaders(errorResponse(404, "Запись не найдена"), rateLimit);
  }

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return withRateLimitHeaders(errorResponse(400, "Тело запроса должно быть корректным JSON"), rateLimit);
  }

  // PUT here means "partial update" (untouched fields keep their current
  // value), same as МойСклад's own PUT semantics — not "replace the whole
  // resource" like plain REST convention. A field explicitly sent as null
  // is still applied (unlike МойСклад, which forbids nulling required
  // fields) — Prisma's own NOT NULL constraint already rejects that case
  // with a clear error, no need to duplicate the check here.
  const data: Record<string, unknown> = {};
  for (const field of config.scalarFields) {
    if (field === "id" || field === "createdAt") continue;
    if (body[field] !== undefined) data[field] = coerceForWrite(field, body[field], config);
  }

  // setAuditActor immediately before the mutation — see
  // lib/audit-context.ts's doc comment for why placement matters (any
  // intervening `await prisma.*`, including the findOwned check above,
  // would lose it again).
  setAuditActor({ orgId: auth.orgId, source: "API", label: auth.actorLabel });
  try {
    const updated = projectRow(await delegate.update({ where: { id }, data }), config);
    const url = new URL(request.url);
    return withRateLimitHeaders(entityResponse(updated, type, buildHref(request, url.pathname)), rateLimit);
  } catch (err) {
    return withRateLimitHeaders(
      errorResponse(409, err instanceof Error ? err.message : "Не удалось обновить запись"),
      rateLimit,
    );
  }
}

export async function DELETE(request: Request, { params }: { params: Promise<{ type: string; id: string }> }) {
  const { type, id } = await params;
  const guard = await guardApiRequest(request, type);
  if (!guard.ok) return guard.response;
  const { auth, config, rateLimit } = guard;

  if (!config.writable) {
    return withRateLimitHeaders(
      errorResponse(405, `Удаление "${type}" через API пока не поддерживается — см. docs/handbook/api/README.md`),
      rateLimit,
    );
  }

  const delegate = getDelegate(config);
  const existing = await findOwned(delegate, auth.orgId, id);
  if (!existing) {
    return withRateLimitHeaders(errorResponse(404, "Запись не найдена"), rateLimit);
  }

  setAuditActor({ orgId: auth.orgId, source: "API", label: auth.actorLabel });
  try {
    await delegate.delete({ where: { id } });
  } catch (err) {
    return withRateLimitHeaders(
      errorResponse(409, err instanceof Error ? err.message : "Не удалось удалить запись — возможно, на неё ссылаются другие документы"),
      rateLimit,
    );
  }

  return withRateLimitHeaders(new NextResponse(null, { status: 204 }), rateLimit);
}

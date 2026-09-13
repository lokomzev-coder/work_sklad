import { withDbRetry } from "@/lib/prisma";
import { setAuditActor } from "@/lib/audit-context";
import { getDelegate, projectRow, coerceForWrite } from "@/lib/api-registry";
import { parseListQuery } from "@/lib/api-query";
import { collectionResponse, entityResponse, errorResponse, buildHref } from "@/lib/api-response";
import { guardApiRequest, withRateLimitHeaders } from "@/lib/api-guard";
import { startExportJob } from "@/lib/export-jobs";

export const dynamic = "force-dynamic";

export async function GET(request: Request, { params }: { params: Promise<{ type: string }> }) {
  const { type } = await params;
  const guard = await guardApiRequest(request, type);
  if (!guard.ok) return guard.response;
  const { auth, config, rateLimit } = guard;

  const url = new URL(request.url);
  const parsed = parseListQuery(url, config);
  if (!parsed.ok) {
    return withRateLimitHeaders(errorResponse(400, parsed.error, { parameter: parsed.parameter }), rateLimit);
  }
  const { limit, offset, where, orderBy, include } = parsed.query;

  // Block O phase 9 — `?async=true`: export every row matching the filter/
  // search/order (not just one page) via a background job, polled at
  // GET /api/v1/export/{id}. See lib/export-jobs.ts's own comment for why
  // this is "run it now in the background", not a real queue.
  if (url.searchParams.get("async") === "true") {
    const job = await startExportJob(auth.orgId, type, config, { where, orderBy, include }, url.search);
    return withRateLimitHeaders(
      entityResponse({ id: job.id, status: "PENDING" }, "exportJob", buildHref(request, `/api/v1/export/${job.id}`), 202),
      rateLimit,
    );
  }

  const delegate = getDelegate(config);
  // withDbRetry: see api-auth.ts's comment — same connection-burst risk,
  // amplified here since every list call is two queries at once.
  const [rows, size] = await withDbRetry(() =>
    Promise.all([
      delegate.findMany({
        where: { orgId: auth.orgId, ...where },
        orderBy,
        include,
        take: limit,
        skip: offset,
      }),
      delegate.count({ where: { orgId: auth.orgId, ...where } }),
    ]),
  );

  const nextOffset = offset + limit;
  const meta = {
    size,
    limit,
    offset,
    nextHref: nextOffset < size ? buildHref(request, `${url.pathname}?${new URLSearchParams({ ...Object.fromEntries(url.searchParams), offset: String(nextOffset) })}`) : null,
    previousHref: offset > 0 ? buildHref(request, `${url.pathname}?${new URLSearchParams({ ...Object.fromEntries(url.searchParams), offset: String(Math.max(0, offset - limit)) })}`) : null,
  };

  return withRateLimitHeaders(collectionResponse(rows.map((row) => projectRow(row, config)), meta), rateLimit);
}

export async function POST(request: Request, { params }: { params: Promise<{ type: string }> }) {
  const { type } = await params;
  const guard = await guardApiRequest(request, type);
  if (!guard.ok) return guard.response;
  const { auth, config, rateLimit } = guard;

  if (!config.writable) {
    return withRateLimitHeaders(
      errorResponse(405, `Создание "${type}" через API пока не поддерживается — см. docs/handbook/api/README.md`),
      rateLimit,
    );
  }

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return withRateLimitHeaders(errorResponse(400, "Тело запроса должно быть корректным JSON"), rateLimit);
  }

  for (const field of config.requiredOnCreate) {
    if (body[field] === undefined || body[field] === null || body[field] === "") {
      return withRateLimitHeaders(errorResponse(412, `Отсутствует обязательное поле "${field}"`, { parameter: field }), rateLimit);
    }
  }

  let fields: Record<string, unknown>;
  if (config.validate) {
    const result = config.validate(body);
    if (!result.ok) {
      return withRateLimitHeaders(errorResponse(400, result.error), rateLimit);
    }
    fields = result.data;
  } else {
    fields = body;
  }

  if (config.asyncValidate) {
    const result = await config.asyncValidate(auth.orgId, fields);
    if (!result.ok) {
      return withRateLimitHeaders(errorResponse(400, result.error), rateLimit);
    }
  }

  const data: Record<string, unknown> = { orgId: auth.orgId };
  for (const field of config.scalarFields) {
    if (field === "id" || field === "createdAt") continue;
    if (fields[field] !== undefined) data[field] = coerceForWrite(field, fields[field], config);
  }

  const delegate = getDelegate(config);
  // setAuditActor immediately before the mutation, not just once earlier in
  // guardApiRequest — see lib/audit-context.ts's doc comment for why this
  // exact placement (no Prisma call in between) is what actually works.
  setAuditActor({ orgId: auth.orgId, source: "API", label: auth.actorLabel });
  try {
    const created = projectRow(await delegate.create({ data }), config);
    const url = new URL(request.url);
    return withRateLimitHeaders(
      entityResponse(created, type, buildHref(request, `${url.pathname}/${created.id}`), 201),
      rateLimit,
    );
  } catch (err) {
    return withRateLimitHeaders(
      errorResponse(409, err instanceof Error ? err.message : "Не удалось создать запись"),
      rateLimit,
    );
  }
}

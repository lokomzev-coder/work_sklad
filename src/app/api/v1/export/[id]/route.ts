import { prisma, withDbRetry } from "@/lib/prisma";
import { resolveApiAuth } from "@/lib/api-auth";
import { checkRateLimit } from "@/lib/api-rate-limit";
import { entityResponse, errorResponse, buildHref } from "@/lib/api-response";
import { withRateLimitHeaders } from "@/lib/api-guard";

export const dynamic = "force-dynamic";

// Not routed through guardApiRequest — an export job has no entity "type"
// to look up in the registry, just auth + rate limit apply here.
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const auth = await resolveApiAuth(request);
  if (!auth) {
    return errorResponse(401, "Неверный или отозванный API-ключ");
  }
  const rateLimit = checkRateLimit(auth.apiKeyId);
  if (!rateLimit.allowed) {
    const response = errorResponse(429, "Превышен лимит запросов");
    response.headers.set("X-RateLimit-Limit", String(rateLimit.limit));
    response.headers.set("X-RateLimit-Remaining", "0");
    return response;
  }

  const job = await withDbRetry(() => prisma.exportJob.findFirst({ where: { id, orgId: auth.orgId } }));
  if (!job) {
    return withRateLimitHeaders(errorResponse(404, "Задача экспорта не найдена"), rateLimit);
  }

  const body: Record<string, unknown> = { id: job.id, entityType: job.entityType, status: job.status };
  if (job.status === "DONE") body.rows = job.result;
  if (job.status === "FAILED") body.error = job.error;

  const url = new URL(request.url);
  return withRateLimitHeaders(entityResponse(body, "exportJob", buildHref(request, url.pathname)), rateLimit);
}

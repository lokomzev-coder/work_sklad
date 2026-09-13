import { NextResponse } from "next/server";
import { resolveApiAuth, type ApiAuthContext } from "@/lib/api-auth";
import { checkRateLimit, type RateLimitResult } from "@/lib/api-rate-limit";
import { getEntityConfig, type ApiEntityConfig } from "@/lib/api-registry";
import { errorResponse } from "@/lib/api-response";

export interface ApiGuardOk {
  ok: true;
  auth: ApiAuthContext;
  config: ApiEntityConfig;
  rateLimit: RateLimitResult;
}

export interface ApiGuardFail {
  ok: false;
  response: NextResponse;
}

/** Shared entry checks for every /api/v1/entity/* route: auth, rate limit,
 * then "does this entity type even exist" — same order МойСклад's own docs
 * describe (auth before anything else is even parsed). */
export async function guardApiRequest(request: Request, type: string): Promise<ApiGuardOk | ApiGuardFail> {
  const auth = await resolveApiAuth(request);
  if (!auth) {
    return { ok: false, response: errorResponse(401, "Неверный или отозванный API-ключ") };
  }

  const rateLimit = checkRateLimit(auth.apiKeyId);
  if (!rateLimit.allowed) {
    const response = errorResponse(429, "Превышен лимит запросов");
    response.headers.set("X-RateLimit-Limit", String(rateLimit.limit));
    response.headers.set("X-RateLimit-Remaining", "0");
    return { ok: false, response };
  }

  const config = getEntityConfig(type);
  if (!config) {
    return { ok: false, response: errorResponse(404, `Неизвестный тип сущности "${type}"`) };
  }

  return { ok: true, auth, config, rateLimit };
}

export function withRateLimitHeaders(response: NextResponse, rateLimit: RateLimitResult): NextResponse {
  response.headers.set("X-RateLimit-Limit", String(rateLimit.limit));
  response.headers.set("X-RateLimit-Remaining", String(rateLimit.remaining));
  return response;
}

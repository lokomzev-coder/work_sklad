import { NextResponse } from "next/server";
import { toJsonSafe } from "@/lib/json-safe";

/** Serializes Prisma's Decimal/Date/BigInt values into plain JSON-safe
 * values (`NextResponse.json` otherwise throws or silently mishandles
 * Decimal) — applied once, right before every response leaves the API. */
export function serialize<T>(value: T): T {
  return toJsonSafe(value);
}

export interface CollectionMeta {
  size: number;
  limit: number;
  offset: number;
  nextHref: string | null;
  previousHref: string | null;
}

export function collectionResponse(rows: unknown[], meta: CollectionMeta) {
  return NextResponse.json({ meta, rows: serialize(rows) });
}

export function entityResponse(entity: Record<string, unknown>, type: string, href: string, status = 200) {
  return NextResponse.json({ meta: { href, type }, ...serialize(entity) }, { status });
}

export interface ApiErrorOptions {
  code?: number;
  parameter?: string;
}

export function errorResponse(status: number, error: string, opts: ApiErrorOptions = {}) {
  return NextResponse.json({ errors: [{ error, ...opts }] }, { status });
}

export function buildHref(request: Request, path: string): string {
  return new URL(path, request.url).toString();
}

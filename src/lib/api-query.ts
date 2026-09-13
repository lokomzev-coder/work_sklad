import type { ApiEntityConfig } from "@/lib/api-registry";

const MAX_LIMIT = 1000;
const DEFAULT_LIMIT = 100;

export interface ParsedListQuery {
  limit: number;
  offset: number;
  where: Record<string, unknown>;
  orderBy?: Record<string, "asc" | "desc">[];
  include?: Record<string, unknown>;
}

export type ParseResult = { ok: true; query: ParsedListQuery } | { ok: false; error: string; parameter?: string };

// Longest operator first, so ">=" isn't matched as ">" followed by "=".
const FILTER_OPERATORS = [">=", "<=", "=", ">", "<"] as const;

/**
 * Coerces a raw filter value according to the field's declared type in the
 * registry — NOT by guessing from the string's shape. Guessing is exactly
 * what caused a real bug here: `Client.inn` is a String field but its
 * values are all digits ("7711111111"), so a shape-based guess coerced it
 * to a Number and Prisma rejected the query outright ("Expected
 * StringNullableFilter... provided Int"). Any field absent from
 * `fieldTypes` is treated as a plain string — the safe default for a
 * schema full of digit-string fields (ИНН, SKU, barcode, phone).
 */
function coerceValue(raw: string, field: string, config: ApiEntityConfig): unknown {
  const type = config.fieldTypes?.[field];
  if (type === "number") return Number(raw);
  if (type === "boolean") return raw === "true";
  if (type === "date") return new Date(raw);
  return raw;
}

/**
 * `filter=field=value;field2>value2` — `;` is AND, one condition per clause.
 * Deliberately narrower than МойСклад's full filter language (no `!=`/`~`/
 * OR-groups) — documented in docs/handbook/api/errors-and-limits.md as a v1
 * scope cut, not an oversight.
 */
function parseFilter(raw: string, config: ApiEntityConfig): { where: Record<string, unknown> } | { error: string } {
  const where: Record<string, unknown> = {};
  for (const clause of raw.split(";").map((c) => c.trim()).filter(Boolean)) {
    const op = FILTER_OPERATORS.find((candidate) => clause.includes(candidate));
    if (!op) return { error: `Некорректное условие фильтра: "${clause}"` };
    const [field, value] = [clause.slice(0, clause.indexOf(op)), clause.slice(clause.indexOf(op) + op.length)];
    if (!config.scalarFields.includes(field)) {
      return { error: `Поле "${field}" недоступно для фильтрации` };
    }
    const coerced = coerceValue(value, field, config);
    if (
      (typeof coerced === "number" && Number.isNaN(coerced)) ||
      (coerced instanceof Date && Number.isNaN(coerced.getTime()))
    ) {
      return { error: `Некорректное значение "${value}" для поля "${field}"` };
    }
    switch (op) {
      case "=":
        where[field] = coerced;
        break;
      case ">":
        where[field] = { gt: coerced };
        break;
      case "<":
        where[field] = { lt: coerced };
        break;
      case ">=":
        where[field] = { gte: coerced };
        break;
      case "<=":
        where[field] = { lte: coerced };
        break;
    }
  }
  return { where };
}

function parseSearch(raw: string, config: ApiEntityConfig): { where: Record<string, unknown> } | { error: string } {
  if (!config.searchFields || config.searchFields.length === 0) {
    return { error: "Поиск недоступен для этого типа сущности" };
  }
  return {
    where: {
      OR: config.searchFields.map((field) => ({ [field]: { contains: raw, mode: "insensitive" } })),
    },
  };
}

function parseOrder(raw: string, config: ApiEntityConfig): { orderBy: Record<string, "asc" | "desc">[] } | { error: string } {
  const orderBy: Record<string, "asc" | "desc">[] = [];
  for (const clause of raw.split(";").map((c) => c.trim()).filter(Boolean)) {
    const [field, direction = "asc"] = clause.split(",").map((s) => s.trim());
    if (!config.scalarFields.includes(field)) {
      return { error: `Поле "${field}" недоступно для сортировки` };
    }
    if (direction !== "asc" && direction !== "desc") {
      return { error: `Направление сортировки должно быть asc или desc, получено "${direction}"` };
    }
    orderBy.push({ [field]: direction });
  }
  return { orderBy };
}

function parseExpand(raw: string, config: ApiEntityConfig): { include: Record<string, unknown> } | { error: string } {
  const include: Record<string, unknown> = {};
  for (const relation of raw.split(",").map((r) => r.trim()).filter(Boolean)) {
    const rule = config.expandable?.[relation];
    if (!rule) {
      return { error: `Связь "${relation}" недоступна для expand у этого типа сущности` };
    }
    include[relation] = rule === true ? true : rule;
  }
  return { include };
}

export type ExpandResult = { ok: true; include: Record<string, unknown> } | { ok: false; error: string };

/** Same `expand` parsing as parseListQuery, exposed standalone for the
 * single-entity GET route (which has no other list-only query params). */
export function parseExpandOnly(raw: string, config: ApiEntityConfig): ExpandResult {
  const result = parseExpand(raw, config);
  if ("error" in result) return { ok: false, error: result.error };
  return { ok: true, include: result.include };
}

export function parseListQuery(url: URL, config: ApiEntityConfig): ParseResult {
  const limitRaw = url.searchParams.get("limit");
  let limit = DEFAULT_LIMIT;
  if (limitRaw !== null) {
    const parsed = Number(limitRaw);
    if (!Number.isFinite(parsed) || parsed <= 0) {
      return { ok: false, error: "limit должен быть положительным числом", parameter: "limit" };
    }
    limit = Math.min(parsed, MAX_LIMIT);
  }

  const offsetRaw = url.searchParams.get("offset");
  let offset = 0;
  if (offsetRaw !== null) {
    const parsed = Number(offsetRaw);
    if (!Number.isFinite(parsed) || parsed < 0) {
      return { ok: false, error: "offset должен быть неотрицательным числом", parameter: "offset" };
    }
    offset = parsed;
  }

  const where: Record<string, unknown> = {};

  const filterRaw = url.searchParams.get("filter");
  if (filterRaw) {
    const result = parseFilter(filterRaw, config);
    if ("error" in result) return { ok: false, error: result.error, parameter: "filter" };
    Object.assign(where, result.where);
  }

  const searchRaw = url.searchParams.get("search");
  if (searchRaw) {
    const result = parseSearch(searchRaw, config);
    if ("error" in result) return { ok: false, error: result.error, parameter: "search" };
    Object.assign(where, result.where);
  }

  let orderBy: Record<string, "asc" | "desc">[] | undefined;
  const orderRaw = url.searchParams.get("order");
  if (orderRaw) {
    const result = parseOrder(orderRaw, config);
    if ("error" in result) return { ok: false, error: result.error, parameter: "order" };
    orderBy = result.orderBy;
  }

  let include: Record<string, unknown> | undefined;
  const expandRaw = url.searchParams.get("expand");
  if (expandRaw) {
    const result = parseExpand(expandRaw, config);
    if ("error" in result) return { ok: false, error: result.error, parameter: "expand" };
    include = result.include;
  }

  return { ok: true, query: { limit, offset, where, orderBy, include } };
}

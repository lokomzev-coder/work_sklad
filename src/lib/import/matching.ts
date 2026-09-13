import { prisma } from "@/lib/prisma";

export type SearchBy = "AUTO" | "SKU" | "BARCODE" | "NAME";

export interface MatchableRow {
  sku?: string;
  barcode?: string;
  name?: string;
}

export type MatchResult =
  | { status: "found"; itemId: string }
  | { status: "not_found" }
  | { status: "ambiguous"; field: "sku" | "barcode" | "name" };

const FIELD_ORDER: readonly ("sku" | "barcode" | "name")[] = ["sku", "barcode", "name"];

const PRISMA_FIELD: Record<"sku" | "barcode" | "name", "sku" | "barcode" | "name"> = {
  sku: "sku",
  barcode: "barcode",
  name: "name",
};

async function findByField(
  orgId: string,
  field: "sku" | "barcode" | "name",
  value: string,
): Promise<string[]> {
  const rows = await prisma.catalogItem.findMany({
    where: { orgId, [PRISMA_FIELD[field]]: value },
    select: { id: true },
  });
  return rows.map((r) => r.id);
}

// None of sku/barcode/name are enforced-unique in this schema — a match can
// legitimately come back with 0, 1, or several rows. Returning "ambiguous"
// instead of guessing the first result is deliberate: silently picking one
// of several candidates would be a quiet data-corruption risk, worse than
// rejecting the row with a clear error the user can fix (e.g. by narrowing
// "Искать по" to a field that's actually unique in their data).
export async function matchCatalogItem(
  orgId: string,
  searchBy: SearchBy,
  row: MatchableRow,
): Promise<MatchResult> {
  const fields = searchBy === "AUTO" ? FIELD_ORDER : [searchBy.toLowerCase() as "sku" | "barcode" | "name"];

  for (const field of fields) {
    const value = row[field];
    if (!value) continue;
    const ids = await findByField(orgId, field, value);
    if (ids.length === 1) return { status: "found", itemId: ids[0] };
    if (ids.length > 1) return { status: "ambiguous", field };
    // 0 matches on this field — AUTO mode falls through to the next field,
    // a single explicit mode has nothing left to try.
  }

  return { status: "not_found" };
}

// The value used both for the initial matching pass above AND for the
// defensive duplicate-within-import rejection (see catalog-import.ts) — the
// same field-priority order for AUTO, so "which value identifies this row"
// stays consistent between the two checks.
export function getMatchKeyValue(searchBy: SearchBy, row: MatchableRow): string | null {
  if (searchBy !== "AUTO") {
    return row[searchBy.toLowerCase() as "sku" | "barcode" | "name"] ?? null;
  }
  for (const field of FIELD_ORDER) {
    if (row[field]) return row[field]!;
  }
  return null;
}

import { prisma } from "@/lib/prisma";
import type { CustomFieldEntityType } from "@/generated/prisma/enums";

export interface CustomFieldDef {
  id: string;
  name: string;
  type: "TEXT" | "NUMBER" | "DATE" | "BOOLEAN" | "SELECT" | "CUSTOM_ENTITY";
  // For SELECT: the definition's own stored list. For CUSTOM_ENTITY: the
  // linked CustomEntityType's current values, resolved live here so a
  // rename/addition shows up everywhere without touching this definition.
  options: string[];
}

export async function listCustomFieldDefinitions(
  orgId: string,
  entityType: CustomFieldEntityType,
): Promise<CustomFieldDef[]> {
  const defs = await prisma.customFieldDefinition.findMany({
    where: { orgId, entityType },
    orderBy: { position: "asc" },
    include: { customEntityType: { include: { values: { orderBy: { position: "asc" } } } } },
  });
  return defs.map((def) => ({
    id: def.id,
    name: def.name,
    type: def.type,
    options: def.type === "CUSTOM_ENTITY" ? (def.customEntityType?.values.map((v) => v.name) ?? []) : def.options,
  }));
}

/** Values keyed by definitionId for one entity row, defs and values fetched separately
 * since values only exist once the entity itself does (creation forms have none yet). */
export async function getCustomFieldValues(entityId: string): Promise<Record<string, string>> {
  const rows = await prisma.customFieldValue.findMany({ where: { entityId } });
  return Object.fromEntries(rows.map((r) => [r.definitionId, r.value ?? ""]));
}

/** Shared upsert core — `values` is definitionId -> raw string (BOOLEAN as
 * "true"/"false", everything else free text). Empty/missing non-BOOLEAN
 * values clear the row rather than storing "". */
async function upsertValues(defs: CustomFieldDef[], entityId: string, values: Record<string, string | undefined>): Promise<void> {
  if (defs.length === 0) return;

  await prisma.$transaction(
    defs.map((def) => {
      const raw = values[def.id];
      const value = def.type === "BOOLEAN" ? (raw === "true" ? "true" : "false") : (raw?.trim() || null);
      return prisma.customFieldValue.upsert({
        where: { definitionId_entityId: { definitionId: def.id, entityId } },
        create: { definitionId: def.id, entityId, value },
        update: { value },
      });
    }),
  );
}

/** Upserts one value per definition for `entityId` from a flat `customField_<definitionId>`
 * FormData shape — for pages using a native `<form action>` (Client, CatalogItem). */
export async function saveCustomFieldValues(
  orgId: string,
  entityType: CustomFieldEntityType,
  entityId: string,
  formData: FormData,
): Promise<void> {
  const defs = await listCustomFieldDefinitions(orgId, entityType);
  const values = Object.fromEntries(
    defs.map((def) => {
      const fieldName = `customField_${def.id}`;
      if (def.type === "BOOLEAN") return [def.id, formData.has(fieldName) ? "true" : "false"];
      const raw = formData.get(fieldName);
      return [def.id, typeof raw === "string" ? raw : ""];
    }),
  );
  await upsertValues(defs, entityId, values);
}

/** Same as saveCustomFieldValues, but for pages that call a Server Action
 * with a plain JS object instead of submitting a native form (Order,
 * PurchaseOrder — their forms are driven entirely by React state). */
export async function saveCustomFieldValuesRecord(
  orgId: string,
  entityType: CustomFieldEntityType,
  entityId: string,
  values: Record<string, string>,
): Promise<void> {
  const defs = await listCustomFieldDefinitions(orgId, entityType);
  await upsertValues(defs, entityId, values);
}

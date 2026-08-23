import { prisma } from "@/lib/prisma";
import type { CustomFieldEntityType } from "@/generated/prisma/enums";

export interface CustomFieldDef {
  id: string;
  name: string;
  type: "TEXT" | "NUMBER" | "DATE" | "BOOLEAN" | "SELECT";
  options: string[];
}

export async function listCustomFieldDefinitions(
  orgId: string,
  entityType: CustomFieldEntityType,
): Promise<CustomFieldDef[]> {
  return prisma.customFieldDefinition.findMany({
    where: { orgId, entityType },
    orderBy: { position: "asc" },
  });
}

/** Values keyed by definitionId for one entity row, defs and values fetched separately
 * since values only exist once the entity itself does (creation forms have none yet). */
export async function getCustomFieldValues(entityId: string): Promise<Record<string, string>> {
  const rows = await prisma.customFieldValue.findMany({ where: { entityId } });
  return Object.fromEntries(rows.map((r) => [r.definitionId, r.value ?? ""]));
}

/** Upserts one value per definition for `entityId` from a flat `customField_<definitionId>`
 * FormData shape — empty strings clear the value rather than storing "". */
export async function saveCustomFieldValues(
  orgId: string,
  entityType: CustomFieldEntityType,
  entityId: string,
  formData: FormData,
): Promise<void> {
  const defs = await listCustomFieldDefinitions(orgId, entityType);
  if (defs.length === 0) return;

  await prisma.$transaction(
    defs.map((def) => {
      const fieldName = `customField_${def.id}`;
      let value: string | null;
      if (def.type === "BOOLEAN") {
        // Unchecked checkboxes submit no key at all — absence is a real
        // "false", not "no value", so this is the one type that never nulls out.
        value = formData.has(fieldName) ? "true" : "false";
      } else {
        const raw = formData.get(fieldName);
        const trimmed = typeof raw === "string" ? raw.trim() : "";
        value = trimmed || null;
      }
      return prisma.customFieldValue.upsert({
        where: { definitionId_entityId: { definitionId: def.id, entityId } },
        create: { definitionId: def.id, entityId, value },
        update: { value },
      });
    }),
  );
}

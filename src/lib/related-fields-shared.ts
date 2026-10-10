// Split out from related-fields.ts specifically so client components (the
// settings manager) can import the constant/types/resolver without pulling
// in `prisma` (and therefore `pg`, which has no browser build) — Next.js
// bundles a whole module's imports into the client chunk the moment any
// export of it is imported from a "use client" file, even if that export
// itself never touches prisma.
import type { RelatedFieldSourceKind, CustomFieldType } from "@/generated/prisma/enums";

/** Fixed registry — the only Client scalars eligible as BUILTIN sources.
 * Deliberately excludes name/status/archivedAt/createdAt/isWalkIn/
 * assignedEmployeeId (not meaningful to surface on another document) and
 * ClientContact[]/ClientAddress[] (multi-row — which one would need its
 * own selection UI, out of scope for this feature). */
export const CLIENT_BUILTIN_FIELDS: { key: string; label: string }[] = [
  { key: "inn", label: "ИНН" },
  { key: "phone", label: "Телефон" },
  { key: "email", label: "Email" },
  { key: "address", label: "Адрес" },
  { key: "kpp", label: "КПП" },
  { key: "ogrn", label: "ОГРН" },
  { key: "bankName", label: "Банк" },
  { key: "bankBik", label: "БИК" },
  { key: "bankAccount", label: "Р/с" },
];

export interface RelatedFieldDef {
  id: string;
  sourceKind: RelatedFieldSourceKind;
  fieldKey: string | null;
  customFieldDefinitionId: string | null;
  // Resolved once here: builtin label from CLIENT_BUILTIN_FIELDS, or the
  // CustomFieldDefinition's own name — callers never need to re-join.
  label: string;
  // Only set for CUSTOM — needed to format BOOLEAN as Да/Нет below.
  customFieldType?: CustomFieldType;
}

// Duck-typed rather than importing the generated Client model type — every
// caller already has a full Client row in hand, which structurally
// satisfies this regardless of which generated-client import path is used
// elsewhere in the project.
export interface ClientBuiltinFieldSource {
  inn: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  kpp: string | null;
  ogrn: string | null;
  bankName: string | null;
  bankBik: string | null;
  bankAccount: string | null;
}

/** Resolves configured defs against one Client row + that Client's own
 * CustomFieldValue map (same shape getCustomFieldValues already returns —
 * keyed by definitionId) into an ordered, display-ready list. Every
 * configured field is always included, even with a blank value (shown as
 * "—") — an earlier version omitted blank fields entirely, which silently
 * hid the whole panel whenever a client had none of the configured fields
 * filled in yet, making the feature look broken/not-wired-up instead of
 * "configured but no data on this client". Always showing the label lets
 * the admin see at a glance that the configuration took effect. */
export function resolveRelatedFields(
  defs: RelatedFieldDef[],
  client: ClientBuiltinFieldSource | null,
  customFieldValues: Record<string, string>,
): { label: string; value: string }[] {
  if (!client) return [];
  return defs.map((def) => {
    if (def.sourceKind === "BUILTIN") {
      const raw = def.fieldKey ? client[def.fieldKey as keyof ClientBuiltinFieldSource] : null;
      return { label: def.label, value: raw && raw.trim() ? raw : "—" };
    }
    const raw = def.customFieldDefinitionId ? customFieldValues[def.customFieldDefinitionId] : undefined;
    if (def.customFieldType === "BOOLEAN") {
      return { label: def.label, value: raw === undefined ? "—" : raw === "true" ? "Да" : "Нет" };
    }
    return { label: def.label, value: raw && raw.trim() ? raw : "—" };
  });
}

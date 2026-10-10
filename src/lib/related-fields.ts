import { prisma } from "@/lib/prisma";
import type { RelatedFieldDocumentType } from "@/generated/prisma/enums";
import { CLIENT_BUILTIN_FIELDS, type RelatedFieldDef } from "@/lib/related-fields-shared";

export { CLIENT_BUILTIN_FIELDS, resolveRelatedFields } from "@/lib/related-fields-shared";
export type { RelatedFieldDef, ClientBuiltinFieldSource } from "@/lib/related-fields-shared";

export async function listRelatedFieldConfigs(
  orgId: string,
  documentType: RelatedFieldDocumentType,
): Promise<RelatedFieldDef[]> {
  const rows = await prisma.relatedFieldConfig.findMany({
    where: { orgId, documentType },
    orderBy: { position: "asc" },
    include: { customFieldDefinition: true },
  });
  return rows.map((row) => {
    if (row.sourceKind === "BUILTIN") {
      const builtin = CLIENT_BUILTIN_FIELDS.find((f) => f.key === row.fieldKey);
      return {
        id: row.id,
        sourceKind: row.sourceKind,
        fieldKey: row.fieldKey,
        customFieldDefinitionId: null,
        label: builtin?.label ?? row.fieldKey ?? "—",
      };
    }
    return {
      id: row.id,
      sourceKind: row.sourceKind,
      fieldKey: null,
      customFieldDefinitionId: row.customFieldDefinitionId,
      label: row.customFieldDefinition?.name ?? "—",
      customFieldType: row.customFieldDefinition?.type,
    };
  });
}

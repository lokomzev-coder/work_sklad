import { prisma } from "@/lib/prisma";
import type { DocumentStatusKind } from "@/generated/prisma/enums";

const DEFAULT_STATUSES: { name: string; color: string; isFinal: boolean }[] = [
  { name: "Черновик", color: "gray", isFinal: false },
  { name: "Подтверждён", color: "blue", isFinal: false },
  { name: "Завершён", color: "green", isFinal: true },
  { name: "Отменён", color: "red", isFinal: true },
];

/**
 * Ensures an org has at least one DocumentStatus for `kind`, seeding the 4
 * defaults (mirroring the old hardcoded enum) if it predates C4 or is brand
 * new. Idempotent: a `createMany` with `skipDuplicates` racing against
 * another caller just means one set of inserts wins.
 */
async function ensureDefaultStatuses(orgId: string, kind: DocumentStatusKind): Promise<void> {
  const count = await prisma.documentStatus.count({ where: { orgId, kind } });
  if (count > 0) return;

  await prisma.documentStatus.createMany({
    data: DEFAULT_STATUSES.map((s, i) => ({
      orgId,
      kind,
      name: s.name,
      color: s.color,
      isFinal: s.isFinal,
      position: i,
    })),
    skipDuplicates: true,
  });
}

export interface DocumentStatusOption {
  id: string;
  name: string;
  color: string;
  isFinal: boolean;
  position: number;
}

/** Returns all statuses for this org/kind, seeding the defaults first if none exist yet. */
export async function listDocumentStatuses(
  orgId: string,
  kind: DocumentStatusKind,
): Promise<DocumentStatusOption[]> {
  await ensureDefaultStatuses(orgId, kind);
  return prisma.documentStatus.findMany({
    where: { orgId, kind },
    orderBy: { position: "asc" },
  });
}

/** The status a brand-new Order/PurchaseOrder starts in — first by position. */
export async function getDefaultStatusId(orgId: string, kind: DocumentStatusKind): Promise<string> {
  const statuses = await listDocumentStatuses(orgId, kind);
  return statuses[0].id;
}

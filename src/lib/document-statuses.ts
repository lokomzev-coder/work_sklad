import { prisma } from "@/lib/prisma";
import type { DocumentStatusKind, Role } from "@/generated/prisma/enums";

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

export interface DocumentStatusTransitionRow {
  id: string;
  fromStatusId: string;
  toStatusId: string;
  allowedRoles: Role[];
}

export async function listTransitions(
  orgId: string,
  kind: DocumentStatusKind,
): Promise<DocumentStatusTransitionRow[]> {
  return prisma.documentStatusTransition.findMany({
    where: { fromStatus: { orgId, kind } },
    select: { id: true, fromStatusId: true, toStatusId: true, allowedRoles: true },
  });
}

/**
 * Statuses `statusId` may move to for `role`, same kind only. A status with
 * NO outgoing transition rows at all is unrestricted (every other status of
 * the same kind is allowed) — this is the pre-existing behavior, so orgs
 * that never configure transitions keep working exactly as before. The
 * moment an org adds one transition FROM a status, that status becomes
 * restricted to only its explicitly listed destinations.
 */
export async function getAllowedNextStatusIds(
  orgId: string,
  kind: DocumentStatusKind,
  statusId: string,
  role: Role,
): Promise<Set<string>> {
  const outgoing = await prisma.documentStatusTransition.findMany({
    where: { fromStatusId: statusId },
  });
  if (outgoing.length === 0) {
    const all = await listDocumentStatuses(orgId, kind);
    return new Set(all.map((s) => s.id).filter((id) => id !== statusId));
  }
  return new Set(
    outgoing
      .filter((t) => t.allowedRoles.length === 0 || t.allowedRoles.includes(role))
      .map((t) => t.toStatusId),
  );
}

/** Statuses selectable in the status dropdown for a document currently at
 * `currentStatusId` — its own status (so the select shows the current
 * value) plus whatever getAllowedNextStatusIds allows for `role`. */
export async function getSelectableStatuses(
  orgId: string,
  kind: DocumentStatusKind,
  currentStatusId: string,
  role: Role,
): Promise<DocumentStatusOption[]> {
  const [all, allowedIds] = await Promise.all([
    listDocumentStatuses(orgId, kind),
    getAllowedNextStatusIds(orgId, kind, currentStatusId, role),
  ]);
  return all.filter((s) => s.id === currentStatusId || allowedIds.has(s.id));
}

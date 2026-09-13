import { prisma } from "@/lib/prisma";

export interface AttachmentRow {
  id: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  position: number;
  createdByName: string;
  createdAt: string;
}

export async function listAttachments(orgId: string, entityType: string, entityId: string): Promise<AttachmentRow[]> {
  const rows = await prisma.attachment.findMany({
    where: { orgId, entityType, entityId },
    orderBy: [{ position: "asc" }, { createdAt: "asc" }],
    include: { createdBy: { select: { fullName: true } } },
  });
  return rows.map((r) => ({
    id: r.id,
    fileName: r.fileName,
    mimeType: r.mimeType,
    sizeBytes: r.sizeBytes,
    position: r.position,
    createdByName: r.createdBy.fullName,
    createdAt: r.createdAt.toISOString(),
  }));
}

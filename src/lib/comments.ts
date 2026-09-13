import { prisma } from "@/lib/prisma";
import type { CommentRow } from "@/components/comments/event-feed";

export async function getComments(orgId: string, entityType: string, entityId: string, viewerEmployeeId: string | null): Promise<CommentRow[]> {
  const rows = await prisma.comment.findMany({
    where: { orgId, entityType, entityId },
    orderBy: { createdAt: "asc" },
    include: { author: { select: { fullName: true } } },
  });
  return rows.map((r) => ({
    id: r.id,
    text: r.text,
    authorName: r.author.fullName,
    createdAt: r.createdAt.toISOString(),
    isOwn: r.authorId === viewerEmployeeId,
  }));
}

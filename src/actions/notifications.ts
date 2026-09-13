"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { getOrgContext } from "@/lib/tenant";

export interface NotificationRow {
  id: string;
  title: string;
  body: string;
  documentType: string;
  documentId: string;
  readAt: string | null;
  createdAt: string;
}

// Visibility here is "mine", not a Resource/assertPermission check — every
// user can see their own notifications regardless of role, same way they
// can always see their own profile.
export async function getMyRecentNotifications(orgSlug: string): Promise<NotificationRow[]> {
  const ctx = await getOrgContext(orgSlug);

  const notifications = await prisma.notification.findMany({
    where: { orgId: ctx.orgId, userId: ctx.userId },
    orderBy: { createdAt: "desc" },
    take: 20,
  });

  return notifications.map((n) => ({
    id: n.id,
    title: n.title,
    body: n.body,
    documentType: n.documentType,
    documentId: n.documentId,
    readAt: n.readAt ? n.readAt.toISOString() : null,
    createdAt: n.createdAt.toISOString(),
  }));
}

export async function getMyUnreadNotificationCount(orgSlug: string): Promise<number> {
  const ctx = await getOrgContext(orgSlug);
  return prisma.notification.count({ where: { orgId: ctx.orgId, userId: ctx.userId, readAt: null } });
}

export async function markNotificationRead(orgSlug: string, notificationId: string) {
  const ctx = await getOrgContext(orgSlug);

  await prisma.notification.updateMany({
    where: { id: notificationId, orgId: ctx.orgId, userId: ctx.userId, readAt: null },
    data: { readAt: new Date() },
  });

  revalidatePath(`/${orgSlug}`, "layout");
}

export async function markAllNotificationsRead(orgSlug: string) {
  const ctx = await getOrgContext(orgSlug);

  await prisma.notification.updateMany({
    where: { orgId: ctx.orgId, userId: ctx.userId, readAt: null },
    data: { readAt: new Date() },
  });

  revalidatePath(`/${orgSlug}`, "layout");
}

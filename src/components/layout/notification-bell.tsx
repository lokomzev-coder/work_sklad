"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { Bell } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  getMyRecentNotifications,
  markNotificationRead,
  markAllNotificationsRead,
  type NotificationRow,
} from "@/actions/notifications";

const DOCUMENT_PATH: Record<string, string> = {
  ORDER: "orders",
  PURCHASE_ORDER: "purchase-orders",
  INVOICE_OUT: "invoices-out",
  INVOICE_IN: "invoices-in",
  PRODUCTION_ORDER: "production",
};

// Block K: no realtime/polling — unreadCount is what the server rendered
// this layout with, refreshed on the next navigation or when the popup is
// opened (which re-fetches). Consistent with the project's existing "no
// background-job infra until Block L" limitation, not a regression.
export function NotificationBell({ orgSlug, initialUnreadCount }: { orgSlug: string; initialUnreadCount: number }) {
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [notifications, setNotifications] = useState<NotificationRow[] | null>(null);
  const [unreadCount, setUnreadCount] = useState(initialUnreadCount);

  function handleOpenChange(next: boolean) {
    setOpen(next);
    if (next && notifications === null) {
      startTransition(async () => {
        const rows = await getMyRecentNotifications(orgSlug);
        setNotifications(rows);
      });
    }
  }

  function handleRowClick(notification: NotificationRow) {
    if (!notification.readAt) {
      setUnreadCount((c) => Math.max(0, c - 1));
      setNotifications((prev) =>
        prev ? prev.map((n) => (n.id === notification.id ? { ...n, readAt: new Date().toISOString() } : n)) : prev,
      );
      startTransition(() => markNotificationRead(orgSlug, notification.id));
    }
    setOpen(false);
  }

  function handleMarkAllRead() {
    setUnreadCount(0);
    setNotifications((prev) =>
      prev ? prev.map((n) => (n.readAt ? n : { ...n, readAt: new Date().toISOString() })) : prev,
    );
    startTransition(() => markAllNotificationsRead(orgSlug));
  }

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger
        render={
          <Button type="button" variant="ghost" size="sm" className="relative">
            <Bell className="size-4" />
            {unreadCount > 0 && (
              <Badge variant="destructive" className="absolute -right-1 -top-1 h-4 min-w-4 justify-center px-1 text-[10px]">
                {unreadCount > 99 ? "99+" : unreadCount}
              </Badge>
            )}
          </Button>
        }
      />
      <PopoverContent className="w-80 p-0" align="end">
        <div className="flex items-center justify-between border-b px-3 py-2">
          <span className="text-sm font-medium">Уведомления</span>
          {unreadCount > 0 && (
            <Button type="button" variant="ghost" size="sm" disabled={isPending} onClick={handleMarkAllRead}>
              Прочитать всё
            </Button>
          )}
        </div>
        <div className="max-h-96 overflow-y-auto">
          {notifications === null ? (
            <p className="px-3 py-4 text-sm text-muted-foreground">Загрузка...</p>
          ) : notifications.length === 0 ? (
            <p className="px-3 py-4 text-sm text-muted-foreground">Уведомлений нет</p>
          ) : (
            notifications.map((n) => (
              <Link
                key={n.id}
                href={`/${orgSlug}/${DOCUMENT_PATH[n.documentType] ?? ""}/${n.documentId}`}
                onClick={() => handleRowClick(n)}
                className={`block border-b px-3 py-2 text-sm last:border-0 hover:bg-muted/50 ${!n.readAt ? "bg-muted/30" : ""}`}
              >
                <div className="font-medium">{n.title}</div>
                <div className="text-muted-foreground">{n.body}</div>
              </Link>
            ))
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}

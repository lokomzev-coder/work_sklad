import { redirect } from "next/navigation";
import Link from "next/link";
import { getOrgContext } from "@/lib/tenant";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { logoutAction } from "@/actions/auth";
import { Button } from "@/components/ui/button";
import { SidebarProvider, SidebarShell, MobileSidebarTrigger } from "@/components/layout/sidebar-shell";
import { CommandPalette } from "@/components/layout/command-palette";
import { PageBreadcrumb } from "@/components/layout/page-breadcrumb";
import { ThemeToggle } from "@/components/layout/theme-toggle";
import { NotificationBell } from "@/components/layout/notification-bell";
import { SubscriptionStateBanner } from "@/components/layout/subscription-state-banner";

export default async function OrgLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ org: string }>;
}) {
  const { org } = await params;
  const ctx = await getOrgContext(org);
  // Block F3: a PRODUCTION login has no business in the regular dashboard
  // (CAPABILITIES.PRODUCTION is "none" everywhere but production) — send it
  // straight to its own interface instead of rendering a mostly-empty shell.
  if (ctx.role === "PRODUCTION") {
    redirect(`/${org}/floor`);
  }
  // Block E: same idea for CASHIER — but unlike PRODUCTION, ADMIN is never
  // excluded from /kassa (see that layout's gate), so this redirect only
  // ever fires for the CASHIER role itself, never for ADMIN checking the
  // kassa view — ADMIN reaches both this dashboard and /kassa freely.
  if (ctx.role === "CASHIER") {
    redirect(`/${org}/kassa`);
  }
  const session = await auth();
  const memberships = session?.memberships ?? [];
  const unreadNotificationCount = await prisma.notification.count({
    where: { orgId: ctx.orgId, userId: ctx.userId, readAt: null },
  });

  return (
    <SidebarProvider>
      <div className="flex min-h-svh">
        <SidebarShell org={org} capabilities={ctx.capabilities} memberships={memberships} />
        <div className="flex min-w-0 flex-1 flex-col">
          <header className="flex items-center justify-between gap-2 border-b px-3 py-3 sm:gap-4 sm:px-6">
            <div className="flex min-w-0 flex-1 items-center gap-2 sm:gap-4">
              <MobileSidebarTrigger />
              <PageBreadcrumb org={org} />
            </div>
            <CommandPalette orgSlug={org} />
            <div className="flex items-center gap-2">
              <NotificationBell orgSlug={org} initialUnreadCount={unreadNotificationCount} />
              <ThemeToggle />
              <span className="hidden text-sm text-muted-foreground sm:inline">
                Роль: {ctx.role}
              </span>
              <Button variant="ghost" size="sm" render={<Link href={`/${org}/settings/profile`} />}>
                Профиль
              </Button>
              <form action={logoutAction}>
                <Button type="submit" variant="outline" size="sm">
                  Выйти
                </Button>
              </form>
            </div>
          </header>
          {ctx.subscriptionState.kind !== "ACTIVE" && (
            <SubscriptionStateBanner org={org} role={ctx.role} state={ctx.subscriptionState} />
          )}
          <main className="flex-1 bg-muted/30 p-4 sm:p-6">{children}</main>
        </div>
      </div>
    </SidebarProvider>
  );
}

import { redirect } from "next/navigation";
import Link from "next/link";
import { getOrgContext } from "@/lib/tenant";
import { auth } from "@/lib/auth";
import { logoutAction } from "@/actions/auth";
import { Button } from "@/components/ui/button";
import { SidebarProvider, SidebarShell, MobileSidebarTrigger } from "@/components/layout/sidebar-shell";
import { CommandPalette } from "@/components/layout/command-palette";
import { PageBreadcrumb } from "@/components/layout/page-breadcrumb";
import { ThemeToggle } from "@/components/layout/theme-toggle";

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
  const session = await auth();
  const memberships = session?.memberships ?? [];

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
          <main className="flex-1 bg-muted/30 p-4 sm:p-6">{children}</main>
        </div>
      </div>
    </SidebarProvider>
  );
}

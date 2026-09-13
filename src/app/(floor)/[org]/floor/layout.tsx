import { redirect } from "next/navigation";
import Link from "next/link";
import { getOrgContext } from "@/lib/tenant";
import { hasFeatureAccess, KNOWN_FEATURE_KEYS } from "@/lib/subscription";
import { logoutAction } from "@/actions/auth";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/layout/theme-toggle";

/**
 * Block F3: the whole point of this route group is that a PRODUCTION-role
 * login never sees the regular dashboard chrome (sidebar/settings/etc) —
 * this layout is deliberately not shared with (dashboard)/[org]/layout.tsx.
 * Any other role landing here (e.g. a manager checking the floor view by
 * URL) is bounced back to the normal dashboard, mirroring the opposite gate
 * in (dashboard)/[org]/layout.tsx.
 */
export default async function FloorLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ org: string }>;
}) {
  const { org } = await params;
  const ctx = await getOrgContext(org);
  if (ctx.role !== "PRODUCTION") {
    redirect(`/${org}`);
  }

  const header = (
    <header className="flex items-center justify-between gap-2 border-b px-4 py-3">
      <span className="text-lg font-semibold">{ctx.orgName} — Производство</span>
      <div className="flex items-center gap-2">
        <ThemeToggle />
        <Button variant="ghost" size="sm" render={<Link href={`/${org}/floor/profile`} />}>
          Профиль
        </Button>
        <form action={logoutAction}>
          <Button type="submit" variant="outline" size="sm">
            Выйти
          </Button>
        </form>
      </div>
    </header>
  );

  // Block S — tariff-gated, not just role. Rendered in place rather than
  // redirected, same reasoning as (kassa)/[org]/kassa/layout.tsx's own
  // gate: PRODUCTION has no dashboard page to be sent to that wouldn't
  // immediately bounce back here via (dashboard)/[org]/layout.tsx's own
  // PRODUCTION→/floor redirect.
  if (!hasFeatureAccess(ctx, KNOWN_FEATURE_KEYS.production)) {
    return (
      <div className="flex min-h-svh flex-col">
        {header}
        <main className="flex flex-1 items-center justify-center bg-muted/30 p-4 sm:p-6">
          <p className="max-w-sm text-center text-sm text-muted-foreground">
            Производственный модуль не входит в текущий тариф организации —
            обратитесь к администратору.
          </p>
        </main>
      </div>
    );
  }

  return (
    <div className="flex min-h-svh flex-col">
      {header}
      <main className="flex-1 bg-muted/30 p-4 sm:p-6">{children}</main>
    </div>
  );
}

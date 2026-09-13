import { redirect } from "next/navigation";
import Link from "next/link";
import { getOrgContext } from "@/lib/tenant";
import { hasFeatureAccess, KNOWN_FEATURE_KEYS } from "@/lib/subscription";
import { logoutAction } from "@/actions/auth";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/layout/theme-toggle";

/**
 * Block E: the whole point of this route group is that a CASHIER-role login
 * never sees the regular dashboard chrome (sidebar/settings/etc) — this
 * layout is deliberately not shared with (dashboard)/[org]/layout.tsx, same
 * idea as (floor)/[org]/floor/layout.tsx for PRODUCTION.
 *
 * One deliberate difference from that PRODUCTION/floor pattern (explicit
 * user requirement): ADMIN is never excluded here — an org's admin/owner
 * reaches every function, including the kassa interface, not just CASHIER.
 * MANAGER/EMPLOYEE/PRODUCTION landing here by URL are still bounced back to
 * the regular dashboard, mirroring the opposite gate there.
 */
export default async function KassaLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ org: string }>;
}) {
  const { org } = await params;
  const ctx = await getOrgContext(org);
  if (ctx.role !== "CASHIER" && ctx.role !== "ADMIN") {
    redirect(`/${org}`);
  }

  const header = (
    <header className="flex items-center justify-between gap-2 border-b px-4 py-3">
      <span className="text-lg font-semibold">{ctx.orgName} — Касса</span>
      <div className="flex items-center gap-2">
        <ThemeToggle />
        <Button variant="ghost" size="sm" render={<Link href={`/${org}/kassa/profile`} />}>
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

  // Block S — tariff-gated, not just role. Deliberately NOT a redirect: a
  // CASHIER bounced to a dashboard page would immediately get bounced right
  // back here by (dashboard)/[org]/layout.tsx's own CASHIER→/kassa redirect
  // (CASHIER has no other reason to be in the dashboard at all) — an
  // infinite loop. Rendering the message in place, without touching
  // `children`, sidesteps that entirely and works the same for ADMIN too.
  if (!hasFeatureAccess(ctx, KNOWN_FEATURE_KEYS.retail)) {
    return (
      <div className="flex min-h-svh flex-col">
        {header}
        <main className="flex flex-1 items-center justify-center bg-muted/30 p-4 sm:p-6">
          <div className="flex max-w-sm flex-col items-center gap-3 text-center">
            <p className="text-sm text-muted-foreground">
              Розничный модуль не входит в текущий тариф организации.
            </p>
            {ctx.role === "ADMIN" && (
              <Button size="sm" render={<Link href={`/${org}/settings/subscription`} />}>
                Перейти к подписке
              </Button>
            )}
          </div>
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

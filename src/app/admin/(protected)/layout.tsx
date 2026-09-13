import Link from "next/link";
import { getPlatformAdminContext, getAdminBasePath } from "@/lib/platform-auth";
import { cn } from "@/lib/utils";

/** Everything under this route group requires a valid platform-admin
 * session — getPlatformAdminContext() redirects to the panel's login page
 * otherwise, same as getOrgContext does for the org side. The login page
 * and /setup/[token] deliberately live OUTSIDE this group (no session
 * exists yet on either page). */
export default async function AdminProtectedLayout({ children }: { children: React.ReactNode }) {
  const ctx = await getPlatformAdminContext();
  const base = getAdminBasePath();

  const NAV_ITEMS = [
    { href: base, label: "Обзор" },
    ...(ctx.capabilities.viewOrganizations ? [{ href: `${base}/organizations`, label: "Организации" }] : []),
    ...(ctx.capabilities.manageSubscriptions
      ? [
          { href: `${base}/plans`, label: "Тарифы" },
          { href: `${base}/feature-catalog`, label: "Конструктор" },
        ]
      : []),
    ...(ctx.capabilities.manageAdmins
      ? [
          { href: `${base}/admins`, label: "Администраторы" },
          { href: `${base}/roles`, label: "Роли" },
        ]
      : []),
    ...(ctx.capabilities.viewAuditLog ? [{ href: `${base}/audit-log`, label: "Журнал аудита" }] : []),
  ];

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <nav className="flex flex-wrap gap-2">
          {NAV_ITEMS.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "rounded-full px-4 py-2 text-sm font-semibold transition-colors",
                "bg-secondary text-secondary-foreground hover:text-foreground",
              )}
            >
              {item.label}
            </Link>
          ))}
        </nav>
        <span className="text-xs text-muted-foreground">{ctx.email}</span>
      </div>
      {children}
    </div>
  );
}

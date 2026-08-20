import { getOrgContext } from "@/lib/tenant";
import { logoutAction } from "@/actions/auth";
import { Button } from "@/components/ui/button";
import { OrgSidebarNav, type NavItem } from "@/components/layout/org-sidebar-nav";

const NAV_ITEMS: NavItem[] = [
  { href: "", label: "Дашборд" },
  { href: "/employees", label: "Сотрудники" },
  { href: "/clients", label: "Клиенты" },
  { href: "/catalog", label: "Товары и услуги" },
  { href: "/orders", label: "Заказы" },
  { href: "/vault", label: "Пароли" },
];

export default async function OrgLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ org: string }>;
}) {
  const { org } = await params;
  const ctx = await getOrgContext(org);

  const navItems = NAV_ITEMS.filter(
    (item) => item.href !== "/vault" || ctx.role !== "EMPLOYEE",
  );

  return (
    <div className="flex min-h-svh">
      <aside className="flex w-60 shrink-0 flex-col bg-sidebar text-sidebar-foreground p-4">
        <div className="mb-6 flex items-center gap-2.5 px-1">
          <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-sidebar-primary text-sm font-semibold text-sidebar-primary-foreground">
            {ctx.orgName.charAt(0).toUpperCase()}
          </div>
          <span className="truncate text-sm font-semibold">
            {ctx.orgName}
          </span>
        </div>
        <OrgSidebarNav org={org} items={navItems} />
      </aside>
      <div className="flex flex-1 flex-col">
        <header className="flex items-center justify-between border-b px-6 py-3">
          <span className="text-sm text-muted-foreground">
            Роль: {ctx.role}
          </span>
          <form action={logoutAction}>
            <Button type="submit" variant="outline" size="sm">
              Выйти
            </Button>
          </form>
        </header>
        <main className="flex-1 bg-muted/30 p-6">{children}</main>
      </div>
    </div>
  );
}

import { getOrgContext } from "@/lib/tenant";
import { auth } from "@/lib/auth";
import { logoutAction } from "@/actions/auth";
import { Button } from "@/components/ui/button";
import { OrgSidebarNav, type NavItem } from "@/components/layout/org-sidebar-nav";
import { OrgSwitcher } from "@/components/layout/org-switcher";
import { CommandPalette } from "@/components/layout/command-palette";

const NAV_ITEMS: NavItem[] = [
  { href: "", label: "Дашборд" },
  { href: "/employees", label: "Сотрудники" },
  { href: "/clients", label: "Клиенты" },
  { href: "/catalog", label: "Товары и услуги" },
  { href: "/warehouse", label: "Склад" },
  { href: "/orders", label: "Заказы" },
  { href: "/purchase-orders", label: "Заказы поставщику" },
  { href: "/payments", label: "Платежи" },
  { href: "/contracts", label: "Договоры" },
  { href: "/reports", label: "Отчёты" },
  { href: "/vault", label: "Пароли" },
  { href: "/settings/legal-entities", label: "Настройки" },
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
  const session = await auth();
  const memberships = session?.memberships ?? [];

  const navItems = NAV_ITEMS.filter(
    (item) =>
      (item.href !== "/vault" && item.href !== "/settings/legal-entities") ||
      ctx.role !== "EMPLOYEE",
  );

  return (
    <div className="flex min-h-svh">
      <aside className="flex w-60 shrink-0 flex-col bg-sidebar text-sidebar-foreground p-4">
        <OrgSwitcher memberships={memberships} currentOrgSlug={org} />
        <OrgSidebarNav org={org} items={navItems} />
      </aside>
      <div className="flex flex-1 flex-col">
        <header className="flex items-center justify-between border-b px-6 py-3">
          <CommandPalette orgSlug={org} />
          <div className="flex items-center gap-3">
            <span className="text-sm text-muted-foreground">
              Роль: {ctx.role}
            </span>
            <form action={logoutAction}>
              <Button type="submit" variant="outline" size="sm">
                Выйти
              </Button>
            </form>
          </div>
        </header>
        <main className="flex-1 bg-muted/30 p-6">{children}</main>
      </div>
    </div>
  );
}

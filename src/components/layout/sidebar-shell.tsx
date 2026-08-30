"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  ShoppingCart,
  Contact,
  Package,
  Warehouse,
  Truck,
  Wallet,
  FileText,
  BarChart3,
  Users,
  KeyRound,
  Settings,
  Factory,
  PanelLeftClose,
  PanelLeftOpen,
  Menu,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { OrgSidebarNav, type NavItem } from "@/components/layout/org-sidebar-nav";
import { OrgSwitcher } from "@/components/layout/org-switcher";
import type { OrgMembership } from "@/types/next-auth";
import type { Role } from "@/generated/prisma/enums";

const STORAGE_KEY = "ew-sidebar-collapsed";

// Icon components can't cross the server→client prop boundary (they're
// forwardRef objects, not plain data), so the nav list — icons included —
// lives here in the client tree rather than being built server-side and
// passed down.
const NAV_ITEMS: NavItem[] = [
  { href: "", label: "Дашборд", icon: LayoutDashboard, group: "Обзор" },
  { href: "/orders", label: "Заказы", icon: ShoppingCart, group: "Продажи" },
  { href: "/clients", label: "Клиенты", icon: Contact, group: "Продажи" },
  { href: "/catalog", label: "Товары и услуги", icon: Package, group: "Продажи" },
  { href: "/purchase-orders", label: "Заказы поставщику", icon: Truck, group: "Снабжение и склад" },
  { href: "/warehouse", label: "Склад", icon: Warehouse, group: "Снабжение и склад" },
  { href: "/production", label: "Производство", icon: Factory, group: "Снабжение и склад" },
  { href: "/payments", label: "Платежи", icon: Wallet, group: "Финансы" },
  { href: "/contracts", label: "Договоры", icon: FileText, group: "Финансы" },
  { href: "/reports", label: "Отчёты", icon: BarChart3, group: "Финансы" },
  { href: "/employees", label: "Сотрудники", icon: Users, group: "Управление" },
  { href: "/vault", label: "Пароли", icon: KeyRound, group: "Управление" },
  { href: "/settings/legal-entities", label: "Настройки", icon: Settings, group: "Управление" },
];

// The hamburger button lives in the header, the drawer it opens lives beside
// the page content — two different places in the tree, so they share state
// through this context rather than through props threaded past layout.tsx.
const MobileSidebarContext = createContext<{ open: boolean; setOpen: (open: boolean) => void } | null>(null);

export function SidebarProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  return <MobileSidebarContext.Provider value={{ open, setOpen }}>{children}</MobileSidebarContext.Provider>;
}

function useMobileSidebar() {
  const ctx = useContext(MobileSidebarContext);
  if (!ctx) throw new Error("useMobileSidebar must be used within a SidebarProvider");
  return ctx;
}

export function MobileSidebarTrigger() {
  const { setOpen } = useMobileSidebar();
  return (
    <Button variant="ghost" size="icon" className="lg:hidden" aria-label="Открыть меню" onClick={() => setOpen(true)}>
      <Menu />
    </Button>
  );
}

interface SidebarContentProps {
  org: string;
  role: Role;
  memberships: OrgMembership[];
  collapsed: boolean;
}

function SidebarContent({ org, role, memberships, collapsed }: SidebarContentProps) {
  const items = NAV_ITEMS.filter(
    (item) => (item.href !== "/vault" && item.href !== "/settings/legal-entities") || role !== "EMPLOYEE",
  );

  return (
    <div className="flex flex-1 flex-col gap-2 overflow-y-auto p-3">
      <OrgSwitcher memberships={memberships} currentOrgSlug={org} collapsed={collapsed} />
      <OrgSidebarNav org={org} items={items} collapsed={collapsed} />
    </div>
  );
}

interface SidebarShellProps {
  org: string;
  role: Role;
  memberships: OrgMembership[];
}

export function SidebarShell({ org, role, memberships }: SidebarShellProps) {
  const { open, setOpen } = useMobileSidebar();
  const [collapsed, setCollapsed] = useState(false);
  const [mounted, setMounted] = useState(false);
  const pathname = usePathname();

  useEffect(() => {
    setMounted(true);
    setCollapsed(window.localStorage.getItem(STORAGE_KEY) === "1");
  }, []);

  // The Sheet doesn't unmount on client-side navigation, so without this a
  // tap on a nav link would leave the drawer open over the new page.
  useEffect(() => {
    setOpen(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname]);

  function toggle() {
    const next = !collapsed;
    setCollapsed(next);
    window.localStorage.setItem(STORAGE_KEY, next ? "1" : "0");
  }

  return (
    <>
      <aside
        className={cn(
          "hidden shrink-0 flex-col border-r border-sidebar-border bg-sidebar text-sidebar-foreground transition-[width] duration-200 lg:flex",
          mounted ? (collapsed ? "w-16" : "w-64") : "w-64",
        )}
      >
        <SidebarContent org={org} role={role} memberships={memberships} collapsed={collapsed} />
        <div className="border-t border-sidebar-border p-2">
          <Button
            variant="ghost"
            size="icon"
            className="w-full text-sidebar-foreground/60 hover:text-sidebar-foreground"
            aria-label={collapsed ? "Развернуть меню" : "Свернуть меню"}
            onClick={toggle}
          >
            {collapsed ? <PanelLeftOpen /> : <PanelLeftClose />}
          </Button>
        </div>
      </aside>

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="left" className="w-72 gap-0 bg-sidebar p-0 text-sidebar-foreground">
          <SheetHeader className="sr-only">
            <SheetTitle>Меню навигации</SheetTitle>
          </SheetHeader>
          <SidebarContent org={org} role={role} memberships={memberships} collapsed={false} />
        </SheetContent>
      </Sheet>
    </>
  );
}

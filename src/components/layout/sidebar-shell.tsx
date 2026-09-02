"use client";

import { createContext, useContext, useEffect, useState, useSyncExternalStore, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  ShoppingCart,
  Contact,
  Package,
  Warehouse,
  Truck,
  Wallet,
  Receipt,
  FileText,
  BarChart3,
  Users,
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
import { can, type Resource, type ResourcePermission } from "@/lib/permissions";

const STORAGE_KEY = "ew-sidebar-collapsed";

// Sidebar collapsed state lives in localStorage, read through
// useSyncExternalStore rather than useState+useEffect: the server snapshot
// (false) matches the pre-hydration client render, so there's no
// setState-after-mount flash to guard against, and no lint-flagged
// synchronous setState inside an effect.
const collapsedListeners = new Set<() => void>();

function subscribeCollapsed(listener: () => void) {
  collapsedListeners.add(listener);
  return () => collapsedListeners.delete(listener);
}

function getCollapsedSnapshot() {
  return window.localStorage.getItem(STORAGE_KEY) === "1";
}

function getCollapsedServerSnapshot() {
  return false;
}

function setCollapsedStorage(next: boolean) {
  window.localStorage.setItem(STORAGE_KEY, next ? "1" : "0");
  collapsedListeners.forEach((listener) => listener());
}

// Icon components can't cross the server→client prop boundary (they're
// forwardRef objects, not plain data), so the nav list — icons included —
// lives here in the client tree rather than being built server-side and
// passed down.
interface GatedNavItem extends NavItem {
  /** Block I2.1 — null means always shown (nothing to gate on); otherwise
   * the item only renders when `can(ctx, resource, "view")`. */
  resource: Resource | null;
}

const NAV_ITEMS: GatedNavItem[] = [
  { href: "", label: "Дашборд", icon: LayoutDashboard, group: "Обзор", resource: "dashboard" },
  { href: "/orders", label: "Заказы", icon: ShoppingCart, group: "Продажи", resource: "orders" },
  { href: "/invoices-out", label: "Счета покупателям", icon: Receipt, group: "Продажи", resource: "invoicesOut" },
  { href: "/clients", label: "Клиенты", icon: Contact, group: "Продажи", resource: "clients" },
  { href: "/catalog", label: "Товары и услуги", icon: Package, group: "Продажи", resource: "catalog" },
  { href: "/purchase-orders", label: "Заказы поставщику", icon: Truck, group: "Снабжение и склад", resource: "purchaseOrders" },
  { href: "/invoices-in", label: "Счета поставщиков", icon: Receipt, group: "Снабжение и склад", resource: "invoicesIn" },
  { href: "/warehouse", label: "Склад", icon: Warehouse, group: "Снабжение и склад", resource: "warehouse" },
  { href: "/production", label: "Производство", icon: Factory, group: "Снабжение и склад", resource: "productionOrders" },
  { href: "/payments", label: "Платежи", icon: Wallet, group: "Финансы", resource: "payments" },
  { href: "/contracts", label: "Договоры", icon: FileText, group: "Финансы", resource: "contracts" },
  { href: "/reports", label: "Отчёты", icon: BarChart3, group: "Финансы", resource: "reports" },
  { href: "/employees", label: "Сотрудники", icon: Users, group: "Управление", resource: "employees" },
  // Vault ("Пароли") nav entry deliberately removed — the feature is hidden
  // for now (see (dashboard)/[org]/vault/layout.tsx), not deleted.
  { href: "/settings/legal-entities", label: "Настройки", icon: Settings, group: "Управление", resource: "legalEntities" },
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
  capabilities: Record<Resource, ResourcePermission>;
  memberships: OrgMembership[];
  collapsed: boolean;
}

function SidebarContent({ org, capabilities, memberships, collapsed }: SidebarContentProps) {
  const items = NAV_ITEMS.filter(
    (item) => item.resource === null || can({ capabilities }, item.resource, "view"),
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
  capabilities: Record<Resource, ResourcePermission>;
  memberships: OrgMembership[];
}

export function SidebarShell({ org, capabilities, memberships }: SidebarShellProps) {
  const { open, setOpen } = useMobileSidebar();
  const collapsed = useSyncExternalStore(subscribeCollapsed, getCollapsedSnapshot, getCollapsedServerSnapshot);
  const pathname = usePathname();

  // The Sheet doesn't unmount on client-side navigation, so without this a
  // tap on a nav link would leave the drawer open over the new page.
  useEffect(() => {
    setOpen(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname]);

  function toggle() {
    setCollapsedStorage(!collapsed);
  }

  return (
    <>
      <aside
        className={cn(
          "hidden shrink-0 flex-col border-r border-sidebar-border bg-sidebar text-sidebar-foreground transition-[width] duration-200 lg:flex",
          collapsed ? "w-16" : "w-64",
        )}
      >
        <SidebarContent org={org} capabilities={capabilities} memberships={memberships} collapsed={collapsed} />
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
          <SidebarContent org={org} capabilities={capabilities} memberships={memberships} collapsed={false} />
        </SheetContent>
      </Sheet>
    </>
  );
}

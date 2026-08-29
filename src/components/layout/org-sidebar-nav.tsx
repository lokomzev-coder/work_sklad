"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

export interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  group: string;
}

interface OrgSidebarNavProps {
  org: string;
  items: NavItem[];
  collapsed?: boolean;
}

export function OrgSidebarNav({ org, items, collapsed }: OrgSidebarNavProps) {
  const pathname = usePathname();

  const groups = items.reduce<{ group: string; items: NavItem[] }[]>((acc, item) => {
    const bucket = acc.find((g) => g.group === item.group);
    if (bucket) bucket.items.push(item);
    else acc.push({ group: item.group, items: [item] });
    return acc;
  }, []);

  function renderNavLink(item: NavItem) {
    const href = `/${org}${item.href}`;
    const isActive =
      item.href === ""
        ? pathname === href
        : pathname === href || pathname.startsWith(`${href}/`);
    const Icon = item.icon;

    const link = (
      <Link
        href={href}
        aria-current={isActive ? "page" : undefined}
        className={cn(
          "group/nav-item relative flex items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-sm font-medium transition-colors",
          collapsed && "justify-center px-0 py-2",
          isActive
            ? "bg-sidebar-primary text-sidebar-primary-foreground"
            : "text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
        )}
      >
        <Icon className="size-4 shrink-0" />
        {!collapsed && <span className="truncate">{item.label}</span>}
      </Link>
    );

    if (!collapsed) return <div key={item.href}>{link}</div>;

    return (
      <Tooltip key={item.href}>
        <TooltipTrigger render={link} />
        <TooltipContent side="right">{item.label}</TooltipContent>
      </Tooltip>
    );
  }

  return (
    <nav className="flex flex-col gap-4">
      {groups.map(({ group, items: groupItems }) => (
        <div key={group} className="flex flex-col gap-0.5">
          {!collapsed && (
            <span className="px-2.5 pb-1 text-[0.7rem] font-semibold tracking-wide text-sidebar-foreground/45 uppercase">
              {group}
            </span>
          )}
          {groupItems.map((item) => renderNavLink(item))}
        </div>
      ))}
    </nav>
  );
}

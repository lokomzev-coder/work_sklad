"use client";

import { useRouter } from "next/navigation";
import { Check, ChevronsUpDown } from "lucide-react";
import { cn } from "@/lib/utils";
import type { OrgMembership } from "@/types/next-auth";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

interface OrgSwitcherProps {
  memberships: OrgMembership[];
  currentOrgSlug: string;
}

export function OrgSwitcher({ memberships, currentOrgSlug }: OrgSwitcherProps) {
  const router = useRouter();
  const current = memberships.find((m) => m.orgSlug === currentOrgSlug);
  const orgName = current?.orgName ?? currentOrgSlug;

  if (memberships.length <= 1) {
    return (
      <div className="mb-6 flex items-center gap-2.5 px-1">
        <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-sidebar-primary text-sm font-semibold text-sidebar-primary-foreground">
          {orgName.charAt(0).toUpperCase()}
        </div>
        <span className="truncate text-sm font-semibold">{orgName}</span>
      </div>
    );
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        className={cn(
          "mb-6 flex w-full items-center gap-2.5 rounded-lg px-1 py-1 text-left outline-none",
          "hover:bg-sidebar-accent",
        )}
      >
        <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-sidebar-primary text-sm font-semibold text-sidebar-primary-foreground">
          {orgName.charAt(0).toUpperCase()}
        </div>
        <span className="min-w-0 flex-1 truncate text-sm font-semibold">
          {orgName}
        </span>
        <ChevronsUpDown className="size-4 shrink-0 text-sidebar-foreground/50" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-56">
        {memberships.map((m) => (
          <DropdownMenuItem
            key={m.orgId}
            onClick={() => {
              if (m.orgSlug !== currentOrgSlug) {
                router.push(`/${m.orgSlug}`);
              }
            }}
          >
            <div className="flex min-w-0 flex-1 flex-col">
              <span className="truncate">{m.orgName}</span>
              <span className="text-xs text-muted-foreground">{m.role}</span>
            </div>
            {m.orgSlug === currentOrgSlug && (
              <Check className="size-4 shrink-0" />
            )}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

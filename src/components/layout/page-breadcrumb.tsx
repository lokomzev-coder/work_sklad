"use client";

import { usePathname } from "next/navigation";
import { Home } from "lucide-react";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { BREADCRUMB_LABELS } from "@/lib/breadcrumb-labels";

/** A path segment with no known label: long opaque ids (cuid/uuid) render as
 * "Карточка", short unknown slugs (e.g. an enum-derived route param) are
 * humanized in place rather than left as a raw slug. */
function labelFor(segment: string): string {
  const known = BREADCRUMB_LABELS[segment];
  if (known) return known;
  if (segment.length > 15) return "Карточка";
  return segment
    .replace(/[-_]/g, " ")
    .replace(/^./, (c) => c.toUpperCase());
}

interface PageBreadcrumbProps {
  org: string;
}

export function PageBreadcrumb({ org }: PageBreadcrumbProps) {
  const pathname = usePathname();
  const rest = pathname
    .replace(new RegExp(`^/${org}`), "")
    .split("/")
    .filter(Boolean);

  return (
    <Breadcrumb className="min-w-0">
      <BreadcrumbList className="flex-wrap sm:flex-nowrap">
        <BreadcrumbItem>
          <BreadcrumbLink render={<a href={`/${org}`} />} className="flex items-center">
            <Home className="size-3.5" />
          </BreadcrumbLink>
        </BreadcrumbItem>
        {rest.map((segment, index) => {
          const href = `/${org}/${rest.slice(0, index + 1).join("/")}`;
          const isLast = index === rest.length - 1;
          return (
            <span key={href} className="contents">
              <BreadcrumbSeparator />
              <BreadcrumbItem>
                {isLast ? (
                  <BreadcrumbPage className="truncate">{labelFor(segment)}</BreadcrumbPage>
                ) : (
                  <BreadcrumbLink render={<a href={href} />} className="truncate">
                    {labelFor(segment)}
                  </BreadcrumbLink>
                )}
              </BreadcrumbItem>
            </span>
          );
        })}
      </BreadcrumbList>
    </Breadcrumb>
  );
}

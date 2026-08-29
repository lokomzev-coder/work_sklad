import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import { TrendingDown, TrendingUp } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { formatPercent } from "@/lib/format";

interface KpiCardProps {
  label: string;
  value: string;
  changePct?: number | null;
  icon?: LucideIcon;
  href?: string;
}

export function KpiCard({ label, value, changePct, icon: Icon, href }: KpiCardProps) {
  const content = (
    <Card className={cn("h-full transition-colors", href && "hover:bg-accent/40")}>
      <CardContent className="flex items-start justify-between gap-3 pt-6">
        <div className="flex min-w-0 flex-col gap-1.5">
          <span className="truncate text-sm text-muted-foreground">{label}</span>
          <span className="truncate text-2xl font-semibold tabular-nums">{value}</span>
          {changePct !== undefined && (
            <span
              className={cn(
                "inline-flex w-fit items-center gap-1 text-xs font-medium",
                changePct === null
                  ? "text-muted-foreground"
                  : changePct >= 0
                    ? "text-emerald-600 dark:text-emerald-400"
                    : "text-red-600 dark:text-red-400",
              )}
            >
              {changePct !== null &&
                (changePct >= 0 ? <TrendingUp className="size-3.5 shrink-0" /> : <TrendingDown className="size-3.5 shrink-0" />)}
              {changePct === null ? "нет данных за период" : `${formatPercent(changePct)} к пред. периоду`}
            </span>
          )}
        </div>
        {Icon && (
          <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <Icon className="size-4.5" />
          </div>
        )}
      </CardContent>
    </Card>
  );

  return href ? <Link href={href}>{content}</Link> : content;
}

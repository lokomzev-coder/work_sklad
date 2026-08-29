/** The 6 color names selectable in Settings → Статусы (DocumentStatus.color,
 * see src/components/settings/document-status-manager.tsx's COLORS list).
 * Central place to turn that free-form string into an actual badge style or
 * chart fill, so every place a status is shown (order/PO lists, dashboard,
 * reports/overview charts) agrees on the same palette instead of each
 * re-inventing it. Falls back to the "gray" swatch for any unknown value. */
const BADGE_CLASSES: Record<string, string> = {
  gray: "bg-muted text-muted-foreground",
  blue: "bg-blue-500/10 text-blue-600 dark:bg-blue-500/15 dark:text-blue-400",
  green: "bg-emerald-500/10 text-emerald-600 dark:bg-emerald-500/15 dark:text-emerald-400",
  red: "bg-red-500/10 text-red-600 dark:bg-red-500/15 dark:text-red-400",
  orange: "bg-orange-500/10 text-orange-600 dark:bg-orange-500/15 dark:text-orange-400",
  purple: "bg-purple-500/10 text-purple-600 dark:bg-purple-500/15 dark:text-purple-400",
};

const CHART_HEX: Record<string, string> = {
  gray: "#9ca3af",
  blue: "#3b82f6",
  green: "#10b981",
  red: "#ef4444",
  orange: "#f97316",
  purple: "#a855f7",
};

export function statusBadgeClass(color: string): string {
  return BADGE_CLASSES[color] ?? BADGE_CLASSES.gray;
}

export function statusChartColor(color: string): string {
  return CHART_HEX[color] ?? CHART_HEX.gray;
}

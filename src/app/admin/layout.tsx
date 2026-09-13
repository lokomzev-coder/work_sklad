/**
 * Блок L — shell for the entire /admin tree. Same UI primitives as the
 * rest of the service (per explicit request: consistent visual language),
 * but deliberately distinct branding (amber/destructive accent instead of
 * primary, "Панель разработчика" label always visible) — a platform admin
 * must never be able to mistake this for a regular organization's
 * dashboard, especially mid-incident when attention is scarce.
 */
export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-svh bg-background">
      <div className="border-b border-destructive/30 bg-destructive/5">
        <div className="mx-auto flex max-w-5xl items-center gap-2 px-6 py-3">
          <div className="flex size-7 items-center justify-center rounded-md bg-destructive text-xs font-bold text-destructive-foreground">
            ES
          </div>
          <span className="text-sm font-semibold tracking-tight">Панель разработчика</span>
        </div>
      </div>
      <div className="mx-auto max-w-5xl p-6">{children}</div>
    </div>
  );
}

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="relative flex min-h-svh items-center justify-center overflow-hidden bg-background p-6">
      <div
        aria-hidden
        className="pointer-events-none absolute -top-32 -right-32 size-96 rounded-full bg-primary/10 blur-3xl"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute -bottom-32 -left-32 size-96 rounded-full bg-primary/10 blur-3xl"
      />
      <div className="relative flex w-full max-w-sm flex-col items-center gap-6">
        <div className="flex items-center gap-2.5">
          <div className="flex size-9 items-center justify-center rounded-xl bg-primary text-sm font-bold text-primary-foreground">
            ES
          </div>
          <span className="text-lg font-semibold tracking-tight">
            WorkSklad
          </span>
        </div>
        <div className="w-full">{children}</div>
      </div>
    </div>
  );
}

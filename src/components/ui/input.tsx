import * as React from "react"
import { Input as InputPrimitive } from "@base-ui/react/input"

import { cn } from "@/lib/utils"

// base-ui's Input hides the text caret on any field — not just date/time
// pickers — by inline-styling `caret-color` based on a client-only
// coarse-pointer (touch) check; that check can't run during SSR, so the
// server and first client render legitimately disagree here on every
// touch-device load. suppressHydrationWarning tells React this specific,
// known-safe mismatch is expected instead of logging it as an error (found
// via real mobile device testing).
function Input({ className, type, ...props }: React.ComponentProps<"input">) {
  return (
    <InputPrimitive
      type={type}
      data-slot="input"
      suppressHydrationWarning
      className={cn(
        "h-8 w-full min-w-0 rounded-lg border border-input bg-transparent px-2.5 py-1 text-base transition-colors outline-none file:inline-flex file:h-6 file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:pointer-events-none disabled:cursor-not-allowed disabled:bg-input/50 disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 md:text-sm dark:bg-input/30 dark:disabled:bg-input/80 dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40",
        className
      )}
      {...props}
    />
  )
}

export { Input }

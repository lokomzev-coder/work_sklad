"use client";

import { Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useHydrated } from "@/hooks/use-hydrated";

export function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme();
  // Avoids a hydration mismatch: resolvedTheme is undefined on the server
  // and on the very first client render (next-themes reads localStorage
  // after mount), so the icon only reflects the real theme post-mount.
  const mounted = useHydrated();

  const isDark = mounted && resolvedTheme === "dark";

  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Button
            variant="ghost"
            size="icon"
            aria-label={isDark ? "Включить светлую тему" : "Включить тёмную тему"}
            onClick={() => setTheme(isDark ? "light" : "dark")}
          >
            {mounted ? (
              isDark ? <Sun /> : <Moon />
            ) : (
              <Sun className="opacity-0" />
            )}
          </Button>
        }
      />
      <TooltipContent>{isDark ? "Светлая тема" : "Тёмная тема"}</TooltipContent>
    </Tooltip>
  );
}

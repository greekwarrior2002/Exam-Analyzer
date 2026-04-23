"use client";

import * as React from "react";
import { Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";
import { Button } from "@/components/ui/button";

export function ThemeToggle() {
  const { theme, setTheme, resolvedTheme } = useTheme();
  const current = theme === "system" ? resolvedTheme : theme;

  return (
    <Button
      variant="ghost"
      size="icon"
      onClick={() => setTheme(current === "dark" ? "light" : "dark")}
      aria-label="Toggle theme"
    >
      <Sun className="h-4 w-4 scale-100 dark:scale-0 dark:-rotate-90 transition-transform" />
      <Moon className="absolute h-4 w-4 scale-0 dark:scale-100 dark:rotate-0 -rotate-90 transition-transform" />
    </Button>
  );
}

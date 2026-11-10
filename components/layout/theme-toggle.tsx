"use client";

import { Moon, Sun } from "lucide-react";
import { useTranslations } from "next-intl";
import { useSyncExternalStore } from "react";

import { Button } from "@/components/ui/button";
import { getResolvedTheme, setThemePreference, subscribeToTheme } from "@/lib/theme/store";

/** Server snapshot is unknown; render both icons and let CSS show the right one. */
const getServerSnapshot = () => null;

export function ThemeToggle({ className }: { className?: string }) {
  const t = useTranslations("Theme");
  const theme = useSyncExternalStore(subscribeToTheme, getResolvedTheme, getServerSnapshot);
  const label = theme === "dark" ? t("toLight") : theme === "light" ? t("toDark") : t("toggle");

  return (
    <Button
      variant="ghost"
      size="icon"
      className={className}
      aria-label={label}
      title={label}
      onClick={() => setThemePreference(getResolvedTheme() === "dark" ? "light" : "dark")}
    >
      <Sun className="hidden dark:block" aria-hidden />
      <Moon className="block dark:hidden" aria-hidden />
    </Button>
  );
}

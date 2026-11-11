"use client";

import { Monitor, Moon, Sun } from "lucide-react";
import { useTranslations } from "next-intl";
import { useSyncExternalStore } from "react";

import { ChoiceCard } from "@/components/ui/choice";
import type { ThemePreference } from "@/lib/theme/constants";
import { readPreference, setThemePreference, subscribeToTheme } from "@/lib/theme/store";

const OPTIONS: { value: ThemePreference; Icon: typeof Sun }[] = [
  { value: "system", Icon: Monitor },
  { value: "light", Icon: Sun },
  { value: "dark", Icon: Moon },
];

export function ThemePicker() {
  const t = useTranslations("Settings.account.themeOptions");
  const preference = useSyncExternalStore(subscribeToTheme, readPreference, () => null);

  return (
    <div role="radiogroup" className="grid gap-3 sm:grid-cols-3">
      {OPTIONS.map(({ value, Icon }) => (
        <ChoiceCard
          key={value}
          selected={preference === value}
          onSelect={() => setThemePreference(value)}
          title={
            <span className="flex items-center gap-2">
              <Icon className="size-4 text-muted" aria-hidden />
              {t(value)}
            </span>
          }
        />
      ))}
    </div>
  );
}

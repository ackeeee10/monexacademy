"use client";

import { useTranslations } from "next-intl";

import { Link, usePathname } from "@/i18n/navigation";
import { cn } from "@/lib/utils";

const items = [
  { href: "/settings", key: "profile" },
  { href: "/settings/preferences", key: "preferences" },
  { href: "/settings/account", key: "account" },
  { href: "/settings/security", key: "security" },
  { href: "/settings/privacy", key: "privacy" },
] as const;

export function SettingsNav() {
  const t = useTranslations("Settings.nav");
  const pathname = usePathname();

  return (
    <nav aria-label={t("profile")} className="-mx-4 overflow-x-auto px-4 md:mx-0 md:px-0">
      <ul className="flex gap-1 md:flex-col">
        {items.map(({ href, key }) => {
          const active = pathname === href;
          return (
            <li key={href}>
              <Link
                href={href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "block whitespace-nowrap rounded-md px-3.5 py-2 text-sm font-medium transition-colors duration-200",
                  active ? "bg-surface-2 text-text md:shadow-[inset_2px_0_0_var(--accent)]" : "text-muted hover:bg-surface-2/60 hover:text-text",
                )}
              >
                {t(key)}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

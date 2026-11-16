"use client";

import { useTranslations } from "next-intl";

import { Link, usePathname } from "@/i18n/navigation";
import { cn } from "@/lib/utils";

const items = [
  { href: "/admin", key: "overview" },
  { href: "/admin/moderation", key: "moderation" },
  { href: "/admin/reports", key: "reports" },
  { href: "/admin/users", key: "users" },
  { href: "/admin/categories", key: "categories" },
  { href: "/admin/audit", key: "audit" },
] as const;

/** Highlights the current section. Reads the URL, so render it inside <Suspense>. */
export function AdminNav() {
  return <AdminNavLinks pathname={usePathname()} />;
}

/** Same links without highlighting; used as the Suspense fallback. */
export function AdminNavStatic() {
  return <AdminNavLinks pathname={null} />;
}

function AdminNavLinks({ pathname }: { pathname: string | null }) {
  const t = useTranslations("Admin.nav");

  return (
    <nav aria-label={t("overview")} className="-mx-4 overflow-x-auto px-4 md:mx-0 md:px-0">
      <ul className="flex gap-1 md:flex-col">
        {items.map(({ href, key }) => {
          const active =
            pathname !== null &&
            (href === "/admin" ? pathname === href : pathname === href || pathname.startsWith(`${href}/`));
          return (
            <li key={href}>
              <Link
                href={href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "block whitespace-nowrap rounded-md px-3.5 py-2 text-sm font-medium transition-colors duration-200",
                  active
                    ? "bg-surface-2 text-text md:shadow-[inset_2px_0_0_var(--accent)]"
                    : "text-muted hover:bg-surface-2/60 hover:text-text",
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

"use client";

import { Link, usePathname } from "@/i18n/navigation";
import { cn } from "@/lib/utils";

type Item = { href: string; label: string };

const linkClass =
  "relative text-sm font-medium text-muted transition-colors duration-200 hover:text-text aria-[current=page]:text-text";

function ActiveLinks({ items }: { items: Item[] }) {
  const pathname = usePathname();
  return items.map(({ href, label }) => {
    const active = pathname === href || pathname.startsWith(`${href}/`);
    return (
      <Link key={href} href={href} aria-current={active ? "page" : undefined} className={linkClass}>
        {label}
      </Link>
    );
  });
}

export function MainNav({ label, items, highlightActive = false }: { label: string; items: Item[]; highlightActive?: boolean }) {
  return (
    <nav aria-label={label} className={cn("hidden items-center gap-8 md:flex")}>
      {highlightActive ? (
        <ActiveLinks items={items} />
      ) : (
        items.map(({ href, label: text }) => (
          <Link key={href} href={href} className={linkClass}>
            {text}
          </Link>
        ))
      )}
    </nav>
  );
}

"use client";

import type { ComponentProps } from "react";

import { Link, usePathname } from "@/i18n/navigation";
import { cn } from "@/lib/utils";

type NavLinkProps = ComponentProps<typeof Link> & { href: string };

export function NavLink({ href, className, ...props }: NavLinkProps) {
  const pathname = usePathname();
  const active = pathname === href || pathname.startsWith(`${href}/`);

  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={cn(
        "relative text-sm font-medium text-muted transition-colors duration-200 hover:text-text",
        "aria-[current=page]:text-text",
        className,
      )}
      {...props}
    />
  );
}

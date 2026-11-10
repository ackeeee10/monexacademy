"use client";

import { Menu, X } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";

import { Logo } from "@/components/brand/logo";
import { Button } from "@/components/ui/button";
import { Link, usePathname } from "@/i18n/navigation";
import { mainNav } from "@/lib/site";

import { ThemeToggle } from "./theme-toggle";

export function MobileNav() {
  const t = useTranslations("Nav");
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  const [lastPath, setLastPath] = useState(pathname);

  // Close the menu after navigating.
  if (pathname !== lastPath) {
    setLastPath(pathname);
    setOpen(false);
  }

  useEffect(() => {
    if (!open) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = previous;
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div className="md:hidden">
      <Button
        variant="ghost"
        size="icon"
        aria-label={t("openMenu")}
        aria-expanded={open}
        aria-controls="mobile-menu"
        onClick={() => setOpen(true)}
      >
        <Menu aria-hidden />
      </Button>

      <AnimatePresence>
        {open && (
          <motion.div
            id="mobile-menu"
            role="dialog"
            aria-modal="true"
            aria-label={t("label")}
            className="fixed inset-0 z-50 flex flex-col bg-bg"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
          >
            <div className="flex h-16 items-center justify-between px-4">
              <Link href="/" aria-label={t("home")} className="text-text">
                <Logo className="h-7" title={null} />
              </Link>
              <Button variant="ghost" size="icon" aria-label={t("closeMenu")} onClick={() => setOpen(false)}>
                <X aria-hidden />
              </Button>
            </div>

            <nav aria-label={t("label")} className="flex flex-1 flex-col px-6 pt-8">
              {mainNav.map((item, i) => (
                <motion.div
                  key={item.href}
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.35, delay: 0.04 * i, ease: [0.22, 1, 0.36, 1] }}
                >
                  <Link
                    href={item.href}
                    className="font-display block border-b border-border py-4 text-2xl font-semibold text-text"
                  >
                    {t(item.key)}
                  </Link>
                </motion.div>
              ))}
            </nav>

            <div className="flex flex-col gap-3 px-6 pb-10">
              <Button asChild size="lg">
                <Link href="/signup">{t("getStarted")}</Link>
              </Button>
              <Button asChild size="lg" variant="secondary">
                <Link href="/login">{t("login")}</Link>
              </Button>
              <ThemeToggle className="self-center" />
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

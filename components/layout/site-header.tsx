import { useTranslations } from "next-intl";

import { Logo } from "@/components/brand/logo";
import { Button } from "@/components/ui/button";
import { Container } from "@/components/ui/container";
import { Link } from "@/i18n/navigation";
import { mainNav } from "@/lib/site";

import { MobileNav } from "./mobile-nav";
import { NavLink } from "./nav-link";
import { ThemeToggle } from "./theme-toggle";

export function SiteHeader() {
  const t = useTranslations("Nav");

  return (
    <header className="sticky top-0 z-40 border-b border-border/70 bg-bg/80 backdrop-blur-xl supports-[backdrop-filter]:bg-bg/65">
      <Container className="grid h-16 grid-cols-[1fr_auto] items-center md:grid-cols-[1fr_auto_1fr]">
        <Link href="/" aria-label={t("home")} className="w-fit text-text">
          <Logo className="h-7 md:h-8" title={null} />
        </Link>

        <nav aria-label={t("label")} className="hidden items-center gap-8 md:flex">
          {mainNav.map((item) => (
            <NavLink key={item.href} href={item.href}>
              {t(item.key)}
            </NavLink>
          ))}
        </nav>

        <div className="flex items-center justify-end gap-1.5">
          <ThemeToggle className="hidden md:inline-flex" />
          <Button asChild variant="ghost" className="hidden md:inline-flex">
            <Link href="/login">{t("login")}</Link>
          </Button>
          <Button asChild className="hidden md:inline-flex">
            <Link href="/signup">{t("getStarted")}</Link>
          </Button>
          <MobileNav />
        </div>
      </Container>
    </header>
  );
}

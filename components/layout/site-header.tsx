import { useTranslations } from "next-intl";
import { Suspense } from "react";

import { Logo } from "@/components/brand/logo";
import { Container } from "@/components/ui/container";
import { Link } from "@/i18n/navigation";
import { mainNav } from "@/lib/site";

import { HeaderAuth, HeaderAuthFallback } from "./header-auth";
import { MainNav } from "./nav-link";

export function SiteHeader() {
  const t = useTranslations("Nav");
  const items = mainNav.map((item) => ({ href: item.href, label: t(item.key) }));

  return (
    <header className="sticky top-0 z-40 border-b border-border/70 bg-bg/80 backdrop-blur-xl supports-[backdrop-filter]:bg-bg/65">
      <Container className="grid h-16 grid-cols-[1fr_auto] items-center md:grid-cols-[1fr_auto_1fr]">
        <Link href="/" aria-label={t("home")} className="w-fit text-text">
          <Logo className="h-7 md:h-8" title={null} />
        </Link>

        {/* Active-link highlighting needs the pathname, which dynamic routes only know at request time. */}
        <Suspense fallback={<MainNav label={t("label")} items={items} />}>
          <MainNav label={t("label")} items={items} highlightActive />
        </Suspense>

        <Suspense fallback={<HeaderAuthFallback />}>
          <HeaderAuth />
        </Suspense>
      </Container>
    </header>
  );
}

import { useTranslations } from "next-intl";

import { Logo } from "@/components/brand/logo";
import { Container } from "@/components/ui/container";
import { Link } from "@/i18n/navigation";
import { footerNav } from "@/lib/site";

import { ThemeToggle } from "./theme-toggle";

type FooterColumnKey = keyof typeof footerNav;

export function SiteFooter({ year }: { year: number }) {
  const t = useTranslations();
  const columns: FooterColumnKey[] = ["product", "company", "legal"];

  return (
    <footer className="border-t border-border bg-surface/40">
      <Container className="grid gap-12 py-16 md:grid-cols-[1.4fr_repeat(3,1fr)]">
        <div className="max-w-sm space-y-5">
          <Logo className="h-8 text-text" title={null} />
          <p className="text-sm leading-relaxed text-muted">{t("Footer.tagline")}</p>
        </div>

        {columns.map((column) => (
          <div key={column}>
            <h2 className="mb-4 text-xs font-semibold uppercase tracking-[0.18em] text-muted">
              {t(`Footer.${column}`)}
            </h2>
            <ul className="space-y-3">
              {footerNav[column].map((item) => (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    className="text-sm text-text/85 transition-colors duration-200 hover:text-accent"
                  >
                    {t(item.label)}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </Container>

      <Container className="flex flex-col gap-4 border-t border-border py-6 text-xs text-muted sm:flex-row sm:items-center sm:justify-between">
        <div className="space-y-1">
          <p className="tabular">{t("Footer.rights", { year })}</p>
          <p>{t("Footer.disclaimer")}</p>
        </div>
        <ThemeToggle />
      </Container>
    </footer>
  );
}

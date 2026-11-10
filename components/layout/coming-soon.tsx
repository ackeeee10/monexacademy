import { ArrowLeft } from "lucide-react";
import { useTranslations } from "next-intl";

import { LogoMark } from "@/components/brand/logo";
import { Reveal } from "@/components/motion/reveal";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Container } from "@/components/ui/container";
import { Link } from "@/i18n/navigation";

export type PageKey =
  | "ideas" | "jobs" | "talent" | "academy" | "pricing" | "howItWorks" | "faq" | "contact"
  | "terms" | "privacy" | "cookies" | "contentPolicy" | "login" | "signup" | "resetPassword";

/** Temporary page shell for routes built in later phases. */
export function ComingSoon({ page }: { page: PageKey }) {
  const t = useTranslations();
  const name = t(`Pages.${page}`);

  return (
    <Container className="flex min-h-[70dvh] flex-col items-center justify-center py-24 text-center">
      <Reveal className="flex flex-col items-center">
        <LogoMark className="mb-8 h-12 text-accent" title={null} />
        <Badge variant="accent" className="mb-6 uppercase tracking-[0.16em]">
          {t("Common.comingSoon")}
        </Badge>
        <h1 className="text-4xl font-bold text-text md:text-5xl">{t("Placeholder.title", { page: name })}</h1>
        <p className="mt-5 max-w-md text-muted">{t("Placeholder.body")}</p>
        <Button asChild variant="secondary" className="mt-10">
          <Link href="/">
            <ArrowLeft aria-hidden />
            {t("Common.backHome")}
          </Link>
        </Button>
      </Reveal>
    </Container>
  );
}

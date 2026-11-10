import { ArrowRight, Rocket, Search, Users } from "lucide-react";
import { useTranslations } from "next-intl";

import { Reveal } from "@/components/motion/reveal";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardTitle } from "@/components/ui/card";
import { Container } from "@/components/ui/container";
import { Link } from "@/i18n/navigation";

import { HeroBackdrop } from "./_components/hero-backdrop";

const pillars = [
  { key: "idea", Icon: Search },
  { key: "team", Icon: Users },
  { key: "earn", Icon: Rocket },
] as const;

// Phase 1 home: brand hero + 3 pillars. The full landing page arrives in Phase 11.
export default function HomePage() {
  const t = useTranslations("Home");

  return (
    <>
      <section className="relative isolate overflow-hidden">
        <HeroBackdrop />
        <Container className="flex min-h-[calc(100dvh-4rem)] flex-col justify-center py-24 md:py-32">
          <div className="animate-rise">
            <Badge variant="accent" className="mb-8 uppercase tracking-[0.16em]">
              {t("eyebrow")}
            </Badge>
          </div>
          <h1 className="max-w-4xl animate-rise text-5xl font-bold leading-[1.02] text-text [animation-delay:80ms] sm:text-6xl lg:text-7xl xl:text-8xl">
            {t("title")}
          </h1>
          <p className="mt-8 max-w-xl animate-rise text-lg leading-relaxed text-muted [animation-delay:160ms] md:text-xl">
            {t("subtitle")}
          </p>
          <div className="mt-10 flex animate-rise flex-col gap-3 [animation-delay:240ms] sm:flex-row">
            <Button asChild size="lg">
              <Link href="/ideas">
                {t("primaryCta")}
                <ArrowRight aria-hidden />
              </Link>
            </Button>
            <Button asChild size="lg" variant="secondary">
              <Link href="/how-it-works">{t("secondaryCta")}</Link>
            </Button>
          </div>
        </Container>
      </section>

      <section className="border-t border-border py-20 md:py-28">
        <Container className="grid gap-5 md:grid-cols-3">
          {pillars.map(({ key, Icon }, i) => (
            <Reveal key={key} delay={i * 0.08}>
              <Card interactive className="h-full">
                <div className="mb-6 flex items-center justify-between">
                  <span className="flex size-11 items-center justify-center rounded-md border border-accent/30 bg-accent/10 text-accent">
                    <Icon className="size-5" aria-hidden />
                  </span>
                  <span className="tabular font-display text-sm text-muted">0{i + 1}</span>
                </div>
                <CardTitle className="mb-2 text-xl">{t(`pillars.${key}.title`)}</CardTitle>
                <CardDescription>{t(`pillars.${key}.body`)}</CardDescription>
              </Card>
            </Reveal>
          ))}
        </Container>
      </section>
    </>
  );
}

import { Check } from "lucide-react";
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Container } from "@/components/ui/container";
import { Link } from "@/i18n/navigation";
import { CHECKOUT_ENABLED, CREDIT_PACKAGES, PLANS, TRIAL } from "@/lib/billing/plans";
import { getCreditPrices } from "@/lib/credits/queries";
import { cn } from "@/lib/utils";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("Pages");
  return { title: t("pricing"), alternates: { canonical: "/pricing" } };
}

const ACTIONS = ["unlock_idea", "first_message", "job_apply", "extra_post", "feature_post"] as const;
const usd = (n: number) => `$${n.toFixed(2).replace(/\.00$/, "")}`;

export default async function PricingPage() {
  const [t, tWallet, prices] = await Promise.all([getTranslations("Pricing"), getTranslations("Wallet"), getCreditPrices()]);

  return (
    <Container className="py-12 md:py-20">
      <div className="mx-auto max-w-2xl text-center">
        <h1 className="text-4xl font-bold text-text md:text-5xl">{t("title")}</h1>
        <p className="mt-4 text-muted">{t("subtitle")}</p>
        <p className="mt-3 text-sm text-accent">{t("trial", { days: TRIAL.days, credits: TRIAL.credits })}</p>
      </div>

      <div className="mt-14 grid gap-6 lg:grid-cols-3">
        {PLANS.map((plan) => {
          const highlight = plan.id === "pro";
          const features = [
            t("features.credits", { value: plan.credits }),
            t("features.posts", { value: plan.posts }),
            t("features.featured", { count: plan.featured }),
            t("features.browse"),
            t("features.lessons"),
            ...(plan.id === "pro" ? [t("features.badgePro")] : plan.id === "elite" ? [t("features.badgeElite")] : []),
          ];
          return (
            <Card key={plan.id} className={cn("flex flex-col gap-6 p-7", highlight && "border-accent shadow-[0_0_0_1px_var(--accent)]")}>
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <h2 className="text-xl font-semibold text-text">{t(`plans.${plan.id}.name`)}</h2>
                  {highlight && <Badge variant="accent">{t("popular")}</Badge>}
                </div>
                <p className="text-sm text-muted">{t(`plans.${plan.id}.tagline`)}</p>
              </div>
              <div>
                <p className="tabular text-4xl font-bold text-text">
                  {usd(plan.monthlyUsd)}
                  <span className="text-base font-normal text-muted"> {t("perMonth")}</span>
                </p>
                {plan.yearlyUsd > 0 && (
                  <p className="tabular mt-1 text-sm text-muted">
                    {usd(plan.yearlyUsd)} {t("perYear")} · {t("yearly")}
                  </p>
                )}
              </div>
              <ul className="space-y-2.5 text-sm">
                {features.map((f) => (
                  <li key={f} className="flex gap-2.5 text-text">
                    <Check className="mt-0.5 size-4 shrink-0 text-accent" aria-hidden />
                    {f}
                  </li>
                ))}
              </ul>
              <div className="mt-auto">
                {plan.id === "free" ? (
                  <Button asChild variant="secondary" className="w-full">
                    <Link href="/signup">{t("getStarted")}</Link>
                  </Button>
                ) : (
                  <Button className="w-full" variant={highlight ? "primary" : "secondary"} disabled={!CHECKOUT_ENABLED}>
                    {CHECKOUT_ENABLED ? t("getStarted") : t("soon")}
                  </Button>
                )}
              </div>
            </Card>
          );
        })}
      </div>

      <div className="mt-16 grid gap-10 lg:grid-cols-2">
        <section className="space-y-4">
          <h2 className="text-xl font-semibold text-text">{t("creditsTitle")}</h2>
          <ul className="divide-y divide-border rounded-lg border border-border bg-surface">
            {ACTIONS.map((a) => (
              <li key={a} className="flex items-center justify-between gap-4 px-4 py-3 text-sm">
                <span className="text-text">{tWallet(`actions.${a}`)}</span>
                <span className="tabular font-medium text-accent">{tWallet("credits", { count: prices[a] ?? 0 })}</span>
              </li>
            ))}
          </ul>
          <p className="text-xs text-muted">{tWallet("creatorShare")}</p>
        </section>

        <section id="credits" className="space-y-4">
          <h2 className="text-xl font-semibold text-text">{t("packagesTitle")}</h2>
          <ul className="grid gap-3 sm:grid-cols-3">
            {CREDIT_PACKAGES.map((p) => (
              <li key={p.id}>
                <Card className="flex h-full flex-col items-center gap-3 p-5 text-center">
                  <p className="tabular text-2xl font-bold text-text">{t("packageCredits", { count: p.credits })}</p>
                  <p className="tabular text-sm text-muted">{usd(p.usd)}</p>
                  <Button size="sm" variant="secondary" className="mt-auto w-full" disabled={!CHECKOUT_ENABLED}>
                    {CHECKOUT_ENABLED ? t("buy") : t("soon")}
                  </Button>
                </Card>
              </li>
            ))}
          </ul>
        </section>
      </div>

      <p className="mx-auto mt-12 max-w-3xl text-center text-xs leading-relaxed text-muted">{t("notes")}</p>
    </Container>
  );
}

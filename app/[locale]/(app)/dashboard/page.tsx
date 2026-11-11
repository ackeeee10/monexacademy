import { ArrowUpRight, Lightbulb, UserRound, UserRoundPen } from "lucide-react";
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { Suspense } from "react";

import { Reveal } from "@/components/motion/reveal";
import { Card, CardDescription, CardTitle } from "@/components/ui/card";
import { Container } from "@/components/ui/container";
import { Skeleton } from "@/components/ui/skeleton";
import { Link } from "@/i18n/navigation";
import { requireAccount } from "@/lib/auth/account";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("Pages");
  return { title: t("dashboard"), robots: { index: false } };
}

// Phase 2 placeholder. Widgets (recommendations, credits, progress…) arrive in Phase 8.
export default function DashboardPage({ searchParams }: PageProps<"/[locale]/dashboard">) {
  return (
    <Container className="py-12 md:py-16">
      <Suspense fallback={<DashboardSkeleton />}>
        <Dashboard searchParams={searchParams} />
      </Suspense>
    </Container>
  );
}

async function Dashboard({ searchParams }: { searchParams: PageProps<"/[locale]/dashboard">["searchParams"] }) {
  const [account, params, t] = await Promise.all([
    requireAccount({ next: "/dashboard" }),
    searchParams,
    getTranslations("Dashboard"),
  ]);
  const name = account.username ? `@${account.username}` : account.email;

  const cards = [
    { href: "/settings", Icon: UserRoundPen, title: t("completeProfile"), body: t("completeProfileBody") },
    { href: "/ideas", Icon: Lightbulb, title: t("browseIdeas"), body: t("browseIdeasBody") },
    { href: `/u/${account.username}`, Icon: UserRound, title: t("viewProfile"), body: t("viewProfileBody") },
  ];

  return (
    <>
      <div className="animate-rise">
        <h1 className="text-3xl font-bold text-text md:text-4xl">
          {params.welcome ? t("welcomeNew", { name }) : t("welcome", { name })}
        </h1>
        <p className="mt-3 text-muted">{t("subtitle")}</p>
      </div>
      <div className="mt-10 grid gap-5 md:grid-cols-3">
        {cards.map(({ href, Icon, title, body }, i) => (
          <Reveal key={href} delay={i * 0.06}>
            <Link href={href} className="group block h-full">
              <Card interactive className="h-full">
                <div className="mb-5 flex items-center justify-between">
                  <span className="flex size-10 items-center justify-center rounded-md border border-accent/30 bg-accent/10 text-accent">
                    <Icon className="size-5" aria-hidden />
                  </span>
                  <ArrowUpRight className="size-4 text-muted transition-colors group-hover:text-accent" aria-hidden />
                </div>
                <CardTitle className="mb-1.5">{title}</CardTitle>
                <CardDescription>{body}</CardDescription>
              </Card>
            </Link>
          </Reveal>
        ))}
      </div>
    </>
  );
}

function DashboardSkeleton() {
  return (
    <div className="space-y-10">
      <div className="space-y-3">
        <Skeleton className="h-10 w-80 max-w-full" />
        <Skeleton className="h-5 w-96 max-w-full" />
      </div>
      <div className="grid gap-5 md:grid-cols-3">
        <Skeleton className="h-44" />
        <Skeleton className="h-44" />
        <Skeleton className="h-44" />
      </div>
    </div>
  );
}

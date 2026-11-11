import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";
import { Suspense } from "react";

import { OnboardingWizard } from "@/components/account/onboarding-wizard";
import { Container } from "@/components/ui/container";
import { Skeleton } from "@/components/ui/skeleton";
import { redirect } from "@/i18n/navigation";
import { getCategories, getSkills } from "@/lib/account/queries";
import { requireAccount } from "@/lib/auth/account";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("Pages");
  return { title: t("onboarding"), robots: { index: false } };
}

export default function OnboardingPage() {
  return (
    <Container className="py-12 md:py-20">
      <Suspense fallback={<WizardSkeleton />}>
        <Onboarding />
      </Suspense>
    </Container>
  );
}

/** Builds a valid username suggestion from the email address. */
function suggestUsername(email: string): string {
  const base = (email.split("@")[0] ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9._]/g, "")
    .slice(0, 20);
  return base.length >= 3 ? base : "";
}

async function Onboarding() {
  const account = await requireAccount({ next: "/onboarding", allowIncompleteOnboarding: true });
  if (account.onboardingCompleted) {
    const locale = await getLocale();
    redirect({ href: "/dashboard", locale });
  }
  const [categories, skills] = await Promise.all([getCategories(), getSkills()]);

  return (
    <OnboardingWizard
      needsBirthDate={!account.hasBirthDate}
      needsTerms={!account.hasAcceptedTerms}
      suggestedUsername={account.username ?? suggestUsername(account.email)}
      categories={categories}
      skills={skills}
    />
  );
}

function WizardSkeleton() {
  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <Skeleton className="h-1" />
      <Skeleton className="h-10 w-3/4" />
      <Skeleton className="h-5 w-1/2" />
      <Skeleton className="h-28" />
      <Skeleton className="h-28" />
    </div>
  );
}

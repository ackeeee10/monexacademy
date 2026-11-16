import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";
import { Suspense } from "react";

import { ConfirmAgeForm } from "@/components/account/confirm-age-form";
import { AuthCard } from "@/components/auth/auth-card";
import { Skeleton } from "@/components/ui/skeleton";
import { redirect } from "@/i18n/navigation";
import { requireAccount } from "@/lib/auth/account";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("Pages");
  return { title: t("confirmAge"), robots: { index: false } };
}

export default async function ConfirmAgePage() {
  const t = await getTranslations("ConfirmAge");
  return (
    <AuthCard title={t("title")} subtitle={t("body")}>
      <Suspense fallback={<Skeleton className="h-40" />}>
        <Gate />
      </Suspense>
    </AuthCard>
  );
}

async function Gate() {
  const account = await requireAccount({ next: "/confirm-age", allowAgeCheck: true });
  if (!account.ageCheckRequired) {
    return redirect({ href: "/dashboard", locale: await getLocale() });
  }
  return <ConfirmAgeForm />;
}

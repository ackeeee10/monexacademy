import type { Metadata } from "next";
import { useTranslations } from "next-intl";
import { getTranslations } from "next-intl/server";
import { Suspense } from "react";

import { AuthCard } from "@/components/auth/auth-card";
import { VerifyMfaForm } from "@/components/auth/forms/verify-mfa-form";
import { Skeleton } from "@/components/ui/skeleton";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("Pages");
  return { title: t("verify2fa"), robots: { index: false } };
}

export default function VerifyTwoFactorPage() {
  const t = useTranslations("Auth");
  return (
    <AuthCard title={t("mfa.title")} subtitle={t("mfa.subtitle")}>
      <Suspense fallback={<Skeleton className="h-36" />}>
        <VerifyMfaForm />
      </Suspense>
    </AuthCard>
  );
}

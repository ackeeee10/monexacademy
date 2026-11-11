import type { Metadata } from "next";
import { useTranslations } from "next-intl";
import { getTranslations } from "next-intl/server";

import { AuthCard } from "@/components/auth/auth-card";
import { SignupForm } from "@/components/auth/forms/signup-form";
import { Link } from "@/i18n/navigation";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("Pages");
  return { title: t("signup") };
}

export default function SignupPage() {
  const t = useTranslations("Auth");
  return (
    <AuthCard
      title={t("signup.title")}
      subtitle={t("signup.subtitle")}
      footer={
        <>
          {t("signup.haveAccount")}{" "}
          <Link href="/login" className="font-medium text-accent hover:underline">
            {t("signup.loginLink")}
          </Link>
        </>
      }
    >
      <SignupForm />
    </AuthCard>
  );
}

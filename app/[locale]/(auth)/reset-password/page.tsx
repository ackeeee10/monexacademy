import type { Metadata } from "next";
import { useTranslations } from "next-intl";
import { getTranslations } from "next-intl/server";

import { AuthCard } from "@/components/auth/auth-card";
import { ResetForm } from "@/components/auth/forms/reset-form";
import { Link } from "@/i18n/navigation";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("Pages");
  return { title: t("resetPassword") };
}

export default function ResetPasswordPage() {
  const t = useTranslations("Auth");
  return (
    <AuthCard
      title={t("reset.title")}
      subtitle={t("reset.subtitle")}
      footer={
        <Link href="/login" className="font-medium text-accent hover:underline">
          {t("reset.back")}
        </Link>
      }
    >
      <ResetForm />
    </AuthCard>
  );
}

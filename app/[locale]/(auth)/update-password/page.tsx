import type { Metadata } from "next";
import { useTranslations } from "next-intl";
import { getTranslations } from "next-intl/server";

import { AuthCard } from "@/components/auth/auth-card";
import { UpdatePasswordForm } from "@/components/auth/forms/update-password-form";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("Pages");
  return { title: t("updatePassword"), robots: { index: false } };
}

export default function UpdatePasswordPage() {
  const t = useTranslations("Auth");
  return (
    <AuthCard title={t("update.title")} subtitle={t("update.subtitle")}>
      <UpdatePasswordForm />
    </AuthCard>
  );
}

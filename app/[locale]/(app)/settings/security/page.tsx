import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { Suspense } from "react";

import { MfaSettings } from "@/components/settings/mfa-settings";
import { SettingsSection } from "@/components/settings/section";
import { SettingsSkeleton } from "@/components/settings/settings-skeleton";
import { hasVerifiedMfa } from "@/lib/account/queries";
import { requireAccount } from "@/lib/auth/account";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("Pages");
  return { title: t("settingsSecurity"), robots: { index: false } };
}

export default function SecuritySettingsPage() {
  return (
    <Suspense fallback={<SettingsSkeleton />}>
      <Security />
    </Suspense>
  );
}

async function Security() {
  await requireAccount({ next: "/settings/security" });
  const [enabled, t] = await Promise.all([hasVerifiedMfa(), getTranslations("Settings.security")]);
  return (
    <SettingsSection title={t("title")} description={t("body")}>
      <MfaSettings enabled={enabled} />
    </SettingsSection>
  );
}

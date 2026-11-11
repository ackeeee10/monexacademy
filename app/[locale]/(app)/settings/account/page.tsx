import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { Suspense } from "react";

import { UpdatePasswordForm } from "@/components/auth/forms/update-password-form";
import { SettingsSection } from "@/components/settings/section";
import { SettingsSkeleton } from "@/components/settings/settings-skeleton";
import { ThemePicker } from "@/components/settings/theme-picker";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { requireAccount } from "@/lib/auth/account";
import { signOut } from "@/lib/auth/actions";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("Pages");
  return { title: t("settingsAccount"), robots: { index: false } };
}

export default async function AccountSettingsPage() {
  const t = await getTranslations("Settings.account");
  return (
    <>
      <Suspense fallback={<SettingsSkeleton />}>
        <AccountDetails />
      </Suspense>
      <SettingsSection title={t("theme")} description={t("themeBody")}>
        <ThemePicker />
      </SettingsSection>
      <SettingsSection title={t("logout")} description={t("logoutBody")}>
        <form action={signOut}>
          <Button type="submit" variant="secondary">
            {t("logout")}
          </Button>
        </form>
      </SettingsSection>
    </>
  );
}

async function AccountDetails() {
  const [account, t] = await Promise.all([requireAccount({ next: "/settings/account" }), getTranslations("Settings.account")]);
  return (
    <>
      <SettingsSection title={t("title")}>
        <div className="max-w-md space-y-2">
          <label htmlFor="account-email" className="text-sm font-medium text-text">
            {t("email")}
          </label>
          <Input id="account-email" value={account.email} readOnly disabled aria-describedby="account-email-hint" />
          <p id="account-email-hint" className="text-xs text-muted">
            {t("emailHint")}
          </p>
        </div>
      </SettingsSection>
      <SettingsSection title={t("password")} description={account.hasPassword ? t("passwordBody") : t("noPasswordBody")}>
        <div className="max-w-md">
          <UpdatePasswordForm doneHref="" submitLabel={account.hasPassword ? t("changePassword") : t("setPassword")} />
        </div>
      </SettingsSection>
    </>
  );
}

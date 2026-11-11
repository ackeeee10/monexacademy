import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { Suspense } from "react";

import { PreferencesForm } from "@/components/settings/preferences-form";
import { SettingsSkeleton } from "@/components/settings/settings-skeleton";
import { getCategories, getMyPreferences } from "@/lib/account/queries";
import { requireAccount } from "@/lib/auth/account";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("Pages");
  return { title: t("settingsPreferences"), robots: { index: false } };
}

export default function PreferencesPage() {
  return (
    <Suspense fallback={<SettingsSkeleton />}>
      <Preferences />
    </Suspense>
  );
}

async function Preferences() {
  await requireAccount({ next: "/settings/preferences" });
  const [prefs, categories] = await Promise.all([getMyPreferences(), getCategories()]);

  return (
    <PreferencesForm
      categories={categories}
      initial={{
        intents: prefs?.intents ?? [],
        budgetRange: prefs?.budgetRange ?? undefined,
        workPreference: prefs?.workPreference ?? undefined,
        teamMode: prefs?.teamMode ?? undefined,
        weeklyTime: prefs?.weeklyTime ?? undefined,
        categories: prefs?.categories ?? [],
      }}
    />
  );
}

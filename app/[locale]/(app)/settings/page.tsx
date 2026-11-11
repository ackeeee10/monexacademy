import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";
import { Suspense } from "react";

import { ProfileForm } from "@/components/settings/profile-form";
import { SettingsSkeleton } from "@/components/settings/settings-skeleton";
import { getMyProfileExtras, getSkills } from "@/lib/account/queries";
import { requireAccount } from "@/lib/auth/account";
import { sortedCountries } from "@/lib/countries";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("Pages");
  return { title: t("settingsProfile"), robots: { index: false } };
}

export default function ProfileSettingsPage() {
  return (
    <Suspense fallback={<SettingsSkeleton />}>
      <ProfileSettings />
    </Suspense>
  );
}

async function ProfileSettings() {
  const account = await requireAccount({ next: "/settings" });
  const [extras, skills, locale] = await Promise.all([getMyProfileExtras(), getSkills(), getLocale()]);

  return (
    <ProfileForm
      avatarUrl={account.avatarUrl}
      skills={skills}
      countries={sortedCountries(locale)}
      initial={{
        username: account.username ?? "",
        bio: account.bio ?? "",
        experience: account.experience ?? "",
        country: account.country ?? "",
        city: account.city ?? "",
        availabilityHours: account.availabilityHours ?? "",
        lookingFor: account.lookingFor,
        skills: extras.skillIds,
        links: extras.links,
        portfolio: extras.portfolio,
      }}
    />
  );
}

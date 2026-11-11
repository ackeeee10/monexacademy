import { Download } from "lucide-react";
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { Suspense } from "react";

import { DeleteAccount } from "@/components/settings/delete-account";
import { SettingsSection } from "@/components/settings/section";
import { SettingsSkeleton } from "@/components/settings/settings-skeleton";
import { Button } from "@/components/ui/button";
import { requireAccount } from "@/lib/auth/account";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("Pages");
  return { title: t("settingsPrivacy"), robots: { index: false } };
}

export default async function PrivacySettingsPage() {
  const t = await getTranslations("Settings.privacy");
  return (
    <>
      <SettingsSection title={t("exportTitle")} description={t("exportBody")}>
        <Button asChild variant="secondary">
          {/* Plain <a>: the export is a file download from an API route, not a page. */}
          <a href="/api/account/export" download>
            <Download aria-hidden />
            {t("export")}
          </a>
        </Button>
      </SettingsSection>
      <Suspense fallback={<SettingsSkeleton />}>
        <DeleteSection />
      </Suspense>
    </>
  );
}

async function DeleteSection() {
  const [account, t] = await Promise.all([requireAccount({ next: "/settings/privacy" }), getTranslations("Settings.privacy")]);
  return (
    <SettingsSection tone="danger" title={t("deleteTitle")} description={t("deleteBody")}>
      <DeleteAccount email={account.email} hasPassword={account.hasPassword} />
    </SettingsSection>
  );
}

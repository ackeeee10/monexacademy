import { getTranslations } from "next-intl/server";

import { SettingsNav } from "@/components/settings/settings-nav";
import { Container } from "@/components/ui/container";

export default async function SettingsLayout({ children }: LayoutProps<"/[locale]/settings">) {
  const t = await getTranslations("Settings");
  return (
    <Container className="py-12 md:py-16">
      <h1 className="text-3xl font-bold text-text md:text-4xl">{t("title")}</h1>
      <div className="mt-8 grid gap-8 md:grid-cols-[200px_1fr] md:gap-12">
        <aside className="md:sticky md:top-24 md:self-start">
          <SettingsNav />
        </aside>
        <div className="min-w-0 space-y-6">{children}</div>
      </div>
    </Container>
  );
}

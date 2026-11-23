import { Mail } from "lucide-react";
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Container } from "@/components/ui/container";
import { SUPPORT_EMAIL } from "@/lib/site";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("Pages");
  return { title: t("contact") };
}

export default async function Page() {
  const t = await getTranslations("Contact");
  const topics = ["account", "billing", "report", "other"] as const;

  return (
    <Container className="max-w-2xl py-20 md:py-28">
      <h1 className="text-4xl font-bold text-text md:text-5xl">{t("title")}</h1>
      <p className="mt-4 text-muted">{t("subtitle")}</p>

      <Card className="mt-10 space-y-6 p-6 md:p-8">
        <div>
          <p className="text-sm text-muted">{t("emailLabel")}</p>
          <a href={`mailto:${SUPPORT_EMAIL}`} className="mt-1 block break-all text-xl font-semibold text-text hover:text-accent">
            {SUPPORT_EMAIL}
          </a>
        </div>
        <Button asChild>
          <a href={`mailto:${SUPPORT_EMAIL}`}>
            <Mail aria-hidden />
            {t("write")}
          </a>
        </Button>
        <ul className="space-y-2 border-t border-border pt-6 text-sm text-muted">
          {topics.map((topic) => (
            <li key={topic}>{t(`topics.${topic}`)}</li>
          ))}
        </ul>
        <p className="text-xs text-muted">{t("response")}</p>
      </Card>
    </Container>
  );
}

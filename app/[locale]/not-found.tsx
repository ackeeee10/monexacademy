import { ArrowLeft } from "lucide-react";
import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import { Container } from "@/components/ui/container";
import { Link } from "@/i18n/navigation";

export default function NotFound() {
  const t = useTranslations();

  return (
    <Container className="flex min-h-[70dvh] flex-col items-center justify-center py-24 text-center">
      <p className="tabular font-display text-7xl font-bold text-accent">404</p>
      <h1 className="mt-6 text-3xl font-bold text-text">{t("NotFound.title")}</h1>
      <p className="mt-4 max-w-md text-muted">{t("NotFound.body")}</p>
      <Button asChild variant="secondary" className="mt-10">
        <Link href="/">
          <ArrowLeft aria-hidden />
          {t("Common.backHome")}
        </Link>
      </Button>
    </Container>
  );
}

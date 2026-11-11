"use client";

import { useTranslations } from "next-intl";

import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";

type SaveBarProps = {
  pending: boolean;
  saved: boolean;
  error?: string;
};

export function SaveBar({ pending, saved, error }: SaveBarProps) {
  const t = useTranslations("Settings");
  return (
    <div className="flex flex-col gap-4 border-t border-border pt-6 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-h-5 flex-1" aria-live="polite">
        {error ? <Alert variant="danger">{error}</Alert> : saved ? <p className="text-sm text-success">{t("saved")}</p> : null}
      </div>
      <Button type="submit" disabled={pending}>
        {pending && <Spinner />}
        {pending ? t("saving") : t("save")}
      </Button>
    </div>
  );
}

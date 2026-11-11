"use client";

import { useTranslations } from "next-intl";
import { useCallback } from "react";

type ErrorKey = Parameters<ReturnType<typeof useTranslations<"Errors">>>[0];

/** Translates error keys coming from Zod or server actions; unknown keys fall back. */
export function useErrorMessage() {
  const t = useTranslations("Errors");
  return useCallback(
    (key: string | undefined): string | undefined => {
      if (!key) return undefined;
      return t.has(key as ErrorKey) ? t(key as ErrorKey) : t("unexpected");
    },
    [t],
  );
}

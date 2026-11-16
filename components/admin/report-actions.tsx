"use client";

import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";

import { runAction } from "@/components/auth/run-action";
import { useErrorMessage } from "@/components/auth/use-error";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useRouter } from "@/i18n/navigation";
import { resolveReportAction } from "@/lib/admin/actions";

/** Resolve or dismiss an open report, with an optional note for the audit log. */
export function ReportActions({ reportId }: { reportId: string }) {
  const t = useTranslations("Admin.reports");
  const errorMessage = useErrorMessage();
  const router = useRouter();
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const run = (status: "resolved" | "dismissed") => {
    setError(null);
    startTransition(async () => {
      const result = await runAction(() => resolveReportAction({ reportId, status, note }));
      if (!result.ok) setError(errorMessage(result.error) ?? null);
      else router.refresh();
    });
  };

  return (
    <div className="space-y-2">
      <div className="flex flex-col gap-2 sm:flex-row">
        <Input
          value={note}
          maxLength={1000}
          placeholder={t("note")}
          aria-label={t("note")}
          onChange={(e) => setNote(e.target.value)}
        />
        <div className="flex gap-2">
          <Button type="button" size="sm" disabled={pending} onClick={() => run("resolved")}>
            {t("resolve")}
          </Button>
          <Button type="button" size="sm" variant="secondary" disabled={pending} onClick={() => run("dismissed")}>
            {t("dismiss")}
          </Button>
        </div>
      </div>
      {error && <p role="alert" className="text-sm text-danger">{error}</p>}
    </div>
  );
}

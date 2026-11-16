"use client";

import { Flag, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { Dialog } from "radix-ui";
import { useState, useTransition } from "react";

import { runAction } from "@/components/auth/run-action";
import { useErrorMessage } from "@/components/auth/use-error";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field, Select, Textarea } from "@/components/ui/field";
import { Link } from "@/i18n/navigation";
import { createReportAction } from "@/lib/reports/actions";
import { REPORT_REASONS } from "@/lib/validation/report";

type Props = {
  targetType: "idea" | "profile";
  targetId: string;
  signedIn: boolean;
  /** Page to return to after signing in. */
  returnPath: string;
};

/** "Report" link that opens a small dialog. Reports go to the admin queue. */
export function ReportButton({ targetType, targetId, signedIn, returnPath }: Props) {
  const t = useTranslations("Report");
  const errorMessage = useErrorMessage();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [details, setDetails] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const [pending, startTransition] = useTransition();

  const triggerClass = "inline-flex items-center gap-1.5 text-sm text-muted transition-colors hover:text-danger";

  if (!signedIn) {
    return (
      <Link href={`/login?next=${encodeURIComponent(returnPath)}`} className={triggerClass}>
        <Flag className="size-4" aria-hidden />
        {t("signIn")}
      </Link>
    );
  }

  const submit = () => {
    setError(null);
    startTransition(async () => {
      const result = await runAction(() =>
        createReportAction({ targetType, targetId, reason: reason as (typeof REPORT_REASONS)[number], details }),
      );
      if (!result.ok) {
        const field = result.fields ? Object.values(result.fields)[0] : undefined;
        setError(errorMessage(field ?? result.error) ?? null);
        return;
      }
      setSent(true);
    });
  };

  return (
    <Dialog.Root
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) {
          setReason("");
          setDetails("");
          setError(null);
          setSent(false);
        }
      }}
    >
      <Dialog.Trigger className={triggerClass}>
        <Flag className="size-4" aria-hidden />
        {t("button")}
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-bg/70 backdrop-blur-sm" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-50 w-[calc(100%-2rem)] max-w-md -translate-x-1/2 -translate-y-1/2 space-y-5 rounded-xl border border-border bg-surface p-6 shadow-[0_24px_60px_-24px_rgb(0_0_0/0.6)]">
          <div className="flex items-start justify-between gap-4">
            <div className="space-y-1">
              <Dialog.Title className="text-lg font-semibold text-text">{t("title")}</Dialog.Title>
              <Dialog.Description className="text-sm text-muted">{t("body")}</Dialog.Description>
            </div>
            <Dialog.Close aria-label={t("cancel")} className="rounded-md p-1 text-muted hover:text-text">
              <X className="size-4" aria-hidden />
            </Dialog.Close>
          </div>

          {sent ? (
            <>
              <Alert variant="success">{t("sent")}</Alert>
              <div className="flex justify-end">
                <Dialog.Close asChild>
                  <Button variant="secondary">{t("cancel")}</Button>
                </Dialog.Close>
              </div>
            </>
          ) : (
            <>
              {error && <Alert variant="danger">{error}</Alert>}
              <Field id="report-reason" label={t("reason")}>
                <Select id="report-reason" value={reason} onChange={(e) => setReason(e.target.value)}>
                  <option value="" disabled>—</option>
                  {REPORT_REASONS.map((r) => (
                    <option key={r} value={r}>{t(`reasons.${r}`)}</option>
                  ))}
                </Select>
              </Field>
              <Field id="report-details" label={t("details")} hint={t("detailsHint")}>
                <Textarea
                  id="report-details"
                  aria-describedby="report-details-hint"
                  value={details}
                  maxLength={1000}
                  className="min-h-24"
                  onChange={(e) => setDetails(e.target.value)}
                />
              </Field>
              <div className="flex justify-end gap-3">
                <Dialog.Close asChild>
                  <Button variant="ghost">{t("cancel")}</Button>
                </Dialog.Close>
                <Button onClick={submit} disabled={pending || reason === ""}>
                  {t("submit")}
                </Button>
              </div>
            </>
          )}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

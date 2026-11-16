"use client";

import { MailCheck } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useState, useTransition, type FormEvent } from "react";

import { FormError } from "@/components/auth/form-error";
import { runAction } from "@/components/auth/run-action";
import { useErrorMessage } from "@/components/auth/use-error";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { useRouter } from "@/i18n/navigation";
import { sendAdminCodeAction, verifyAdminCodeAction } from "@/lib/admin/email-code";

const RESEND_SECONDS = 60;

/** One-time-per-login admin check: email a 6-digit code, then type it in. */
export function EmailCodeGate({ maskedEmail }: { maskedEmail: string }) {
  const t = useTranslations("Admin.gate");
  const errorMessage = useErrorMessage();
  const router = useRouter();
  const [sent, setSent] = useState(false);
  const [code, setCode] = useState("");
  const [cooldown, setCooldown] = useState(0);
  const [error, setError] = useState<{ message: string; detail?: string } | null>(null);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    if (cooldown <= 0) return;
    const id = setTimeout(() => setCooldown((s) => s - 1), 1000);
    return () => clearTimeout(id);
  }, [cooldown]);

  const send = () => {
    setError(null);
    startTransition(async () => {
      const result = await runAction(() => sendAdminCodeAction());
      if (!result.ok) {
        setError({ message: errorMessage(result.error) ?? "", detail: result.detail });
        return;
      }
      setSent(true);
      setCode("");
      setCooldown(RESEND_SECONDS);
    });
  };

  const verify = (value: string) => {
    setError(null);
    startTransition(async () => {
      const result = await runAction(() => verifyAdminCodeAction({ code: value }));
      if (!result.ok) {
        setError({ message: errorMessage(result.error) ?? "" });
        return;
      }
      router.refresh();
    });
  };

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (code.length === 6) verify(code);
  };

  return (
    <div className="max-w-md space-y-5 rounded-lg border border-border bg-surface p-8">
      <span className="flex size-11 items-center justify-center rounded-full border border-accent/40 bg-accent/10 text-accent">
        <MailCheck className="size-5" aria-hidden />
      </span>
      <div className="space-y-2">
        <h2 className="text-xl font-semibold text-text">{t("title")}</h2>
        <p className="text-sm leading-relaxed text-muted">{t("body", { email: maskedEmail })}</p>
      </div>

      {error && <FormError message={error.message} detail={error.detail} />}

      {!sent ? (
        <Button onClick={send} disabled={pending} className="w-full">
          {pending && <Spinner />}
          {t("send")}
        </Button>
      ) : (
        <form onSubmit={onSubmit} className="space-y-4">
          <Alert variant="success">{t("sent", { email: maskedEmail })}</Alert>
          <Field id="admin-code" label={t("code")} hint={t("spam")}>
            <Input
              id="admin-code"
              aria-describedby="admin-code-hint"
              value={code}
              autoFocus
              inputMode="numeric"
              autoComplete="one-time-code"
              placeholder="000000"
              className="tabular h-12 text-center text-lg tracking-[0.4em]"
              onChange={(e) => {
                const next = e.target.value.replace(/\D/g, "").slice(0, 6);
                setCode(next);
                // Confirm as soon as all six digits are in.
                if (next.length === 6 && !pending) verify(next);
              }}
            />
          </Field>
          <Button type="submit" className="w-full" disabled={pending || code.length !== 6}>
            {pending && <Spinner />}
            {t("verify")}
          </Button>
          <Button type="button" variant="ghost" className="w-full" disabled={pending || cooldown > 0} onClick={send}>
            {cooldown > 0 ? t("resendIn", { seconds: cooldown }) : t("resend")}
          </Button>
        </form>
      )}
    </div>
  );
}

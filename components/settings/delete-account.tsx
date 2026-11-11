"use client";

import { useTranslations } from "next-intl";
import { useState, type FormEvent } from "react";

import { PasswordInput } from "@/components/auth/password-input";
import { useTurnstile } from "@/components/auth/turnstile";
import { useErrorMessage } from "@/components/auth/use-error";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { deleteAccount } from "@/lib/account/actions";

export function DeleteAccount({ email, hasPassword }: { email: string; hasPassword: boolean }) {
  const t = useTranslations("Settings.privacy");
  const errorMessage = useErrorMessage();
  const turnstile = useTurnstile();
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string>();

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setPending(true);
    setError(undefined);
    const captchaToken = hasPassword ? await turnstile.getToken() : undefined;
    const result = await deleteAccount({ confirmation: value, captchaToken });
    // Success redirects away; we only get here on failure.
    setPending(false);
    turnstile.reset();
    if (!result.ok) setError(errorMessage(result.error));
  }

  if (!open) {
    return (
      <Button variant="secondary" className="border-danger/50 text-danger hover:border-danger hover:bg-danger/10" onClick={() => setOpen(true)}>
        {t("delete")}
      </Button>
    );
  }

  return (
    <form onSubmit={onSubmit} className="max-w-md space-y-5">
      {error && <Alert variant="danger">{error}</Alert>}
      <Field id="delete-confirm" label={hasPassword ? t("confirmPassword") : t("confirmEmail", { email })}>
        {hasPassword ? (
          <PasswordInput id="delete-confirm" value={value} onChange={(e) => setValue(e.target.value)} autoComplete="current-password" />
        ) : (
          <Input id="delete-confirm" value={value} onChange={(e) => setValue(e.target.value)} autoComplete="off" spellCheck={false} />
        )}
      </Field>
      {hasPassword && turnstile.widget}
      <div className="flex flex-wrap gap-3">
        <Button type="submit" disabled={pending || !value} className="bg-danger text-white shadow-none hover:shadow-none hover:brightness-110">
          {pending && <Spinner />}
          {t("deleteConfirm")}
        </Button>
        <Button type="button" variant="ghost" onClick={() => { setOpen(false); setValue(""); setError(undefined); }}>
          {t("cancel")}
        </Button>
      </div>
    </form>
  );
}

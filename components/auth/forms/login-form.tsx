"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { useForm } from "react-hook-form";

import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { fieldAria, Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { Link } from "@/i18n/navigation";
import { sendMagicLink, signInWithPassword } from "@/lib/auth/actions";
import { cn } from "@/lib/utils";
import { magicLinkSchema, signInSchema, type MagicLinkInput, type SignInInput } from "@/lib/validation/auth";

import { GoogleButton, OrDivider } from "../google-button";
import { PasswordInput } from "../password-input";
import { useTurnstile } from "../turnstile";
import { useErrorMessage } from "../use-error";
import { runAction } from "@/components/auth/run-action";
import { FormError } from "@/components/auth/form-error";

type Mode = "password" | "magic";

export function LoginForm() {
  const t = useTranslations("Auth");
  const params = useSearchParams();
  const next = params.get("next") ?? undefined;
  const [mode, setMode] = useState<Mode>("password");

  const notice = params.get("deleted")
    ? t("login.deleted")
    : params.get("error") === "link_expired"
      ? t("login.linkExpired")
      : null;

  return (
    <div className="space-y-6">
      {notice && <Alert variant={params.get("deleted") ? "info" : "danger"}>{notice}</Alert>}

      <GoogleButton next={next} />
      <OrDivider />

      <div role="tablist" aria-label={t("login.title")} className="grid grid-cols-2 rounded-md border border-border bg-bg p-1">
        {(["password", "magic"] as const).map((m) => (
          <button
            key={m}
            type="button"
            role="tab"
            aria-selected={mode === m}
            onClick={() => setMode(m)}
            className={cn(
              "h-8 rounded-[6px] text-sm font-medium transition-colors duration-200",
              mode === m ? "bg-surface-2 text-text" : "text-muted hover:text-text",
            )}
          >
            {m === "password" ? t("login.passwordTab") : t("login.magicTab")}
          </button>
        ))}
      </div>

      {mode === "password" ? <PasswordLogin next={next} /> : <MagicLinkLogin next={next} />}
    </div>
  );
}

function PasswordLogin({ next }: { next?: string }) {
  const t = useTranslations("Auth");
  const errorMessage = useErrorMessage();
  const turnstile = useTurnstile();
  const [formError, setFormError] = useState<string>();
  const [formDetail, setFormDetail] = useState<string>();

  const form = useForm<SignInInput>({ resolver: zodResolver(signInSchema), defaultValues: { email: "", password: "", next } });
  const { errors, isSubmitting } = form.formState;

  const onSubmit = form.handleSubmit(async (values) => {
    setFormError(undefined);
    setFormDetail(undefined);
    const captchaToken = await turnstile.getToken();
    const result = await runAction(() => signInWithPassword({ ...values, captchaToken, next }));
    // On success the action redirects; we only get here on failure.
    if (!result.ok) {
      setFormError(errorMessage(result.error));
      setFormDetail(result.error === "captchaFailed" ? (turnstile.lastError() ?? result.detail) : undefined);
      turnstile.reset();
    }
  });

  return (
    <form onSubmit={onSubmit} noValidate className="space-y-5">
      {formError && <FormError message={formError} detail={formDetail} />}
      <Field id="email" label={t("email")} error={errorMessage(errors.email?.message)}>
        <Input
          {...fieldAria("email", errors.email?.message)}
          type="email"
          autoComplete="email"
          placeholder={t("emailPlaceholder")}
          {...form.register("email")}
        />
      </Field>
      <Field
        id="password"
        label={t("password")}
        error={errorMessage(errors.password?.message)}
        aside={
          <Link href="/reset-password" className="text-xs text-accent hover:underline">
            {t("login.forgot")}
          </Link>
        }
      >
        <PasswordInput
          {...fieldAria("password", errors.password?.message)}
          autoComplete="current-password"
          {...form.register("password")}
        />
      </Field>
      {turnstile.widget}
      <Button type="submit" size="lg" className="w-full" disabled={isSubmitting}>
        {isSubmitting && <Spinner />}
        {turnstile.waiting ? t("verifying") : t("login.submit")}
      </Button>
    </form>
  );
}

function MagicLinkLogin({ next }: { next?: string }) {
  const t = useTranslations("Auth");
  const errorMessage = useErrorMessage();
  const turnstile = useTurnstile();
  const [formError, setFormError] = useState<string>();
  const [formDetail, setFormDetail] = useState<string>();
  const [sentTo, setSentTo] = useState<string>();

  const form = useForm<MagicLinkInput>({ resolver: zodResolver(magicLinkSchema), defaultValues: { email: "" } });
  const { errors, isSubmitting } = form.formState;

  const onSubmit = form.handleSubmit(async (values) => {
    setFormError(undefined);
    setFormDetail(undefined);
    const captchaToken = await turnstile.getToken();
    const result = await runAction(() => sendMagicLink({ ...values, captchaToken, next }));
    turnstile.reset();
    if (result.ok) setSentTo(values.email);
    else {
      setFormError(errorMessage(result.error));
      setFormDetail(result.error === "captchaFailed" ? (turnstile.lastError() ?? result.detail) : undefined);
    }
  });

  if (sentTo) return <Alert variant="success">{t("login.magicSent", { email: sentTo })}</Alert>;

  return (
    <form onSubmit={onSubmit} noValidate className="space-y-5">
      {formError && <FormError message={formError} detail={formDetail} />}
      <Field id="magic-email" label={t("email")} hint={t("login.magicHint")} error={errorMessage(errors.email?.message)}>
        <Input
          {...fieldAria("magic-email", errors.email?.message, true)}
          type="email"
          autoComplete="email"
          placeholder={t("emailPlaceholder")}
          {...form.register("email")}
        />
      </Field>
      {turnstile.widget}
      <Button type="submit" size="lg" className="w-full" disabled={isSubmitting}>
        {isSubmitting && <Spinner />}
        {turnstile.waiting ? t("verifying") : t("login.magicSubmit")}
      </Button>
    </form>
  );
}

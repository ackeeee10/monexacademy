"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { MailCheck } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { useForm } from "react-hook-form";

import { Button } from "@/components/ui/button";
import { Checkbox, fieldAria, Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { Link } from "@/i18n/navigation";
import { signUp } from "@/lib/auth/actions";
import { signUpSchema, type SignUpInput } from "@/lib/validation/auth";

import { GoogleButton, OrDivider } from "../google-button";
import { PasswordInput } from "../password-input";
import { useTurnstile } from "../turnstile";
import { useErrorMessage } from "../use-error";
import { runAction } from "@/components/auth/run-action";
import { FormError } from "@/components/auth/form-error";

export function SignupForm() {
  const t = useTranslations("Auth");
  const errorMessage = useErrorMessage();
  const turnstile = useTurnstile();
  const [formError, setFormError] = useState<string>();
  const [formDetail, setFormDetail] = useState<string>();
  const [sentTo, setSentTo] = useState<string>();

  const form = useForm<SignUpInput>({
    resolver: zodResolver(signUpSchema),
    defaultValues: { email: "", password: "", birthDate: "", acceptTerms: false as unknown as true },
  });
  const { errors, isSubmitting } = form.formState;

  const onSubmit = form.handleSubmit(async (values) => {
    setFormError(undefined);
    setFormDetail(undefined);
    const captchaToken = await turnstile.getToken();
    const result = await runAction(() => signUp({ ...values, captchaToken }));
    turnstile.reset();
    if (result.ok) setSentTo(values.email);
    else {
      setFormError(errorMessage(result.error));
      setFormDetail(result.error === "captchaFailed" ? (turnstile.lastError() ?? result.detail) : undefined);
    }
  });

  if (sentTo) {
    return (
      <div className="space-y-4 text-center">
        <span className="mx-auto flex size-12 items-center justify-center rounded-full border border-accent/30 bg-accent/10 text-accent">
          <MailCheck className="size-5" aria-hidden />
        </span>
        <h2 className="text-lg font-semibold text-text">{t("signup.checkEmailTitle")}</h2>
        <p className="text-sm text-muted">{t("signup.checkEmail", { email: sentTo })}</p>
        <p className="text-xs text-muted">{t("signup.checkEmailHint")}</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <GoogleButton next="/onboarding" />
      <OrDivider />
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
        <Field id="password" label={t("password")} hint={t("passwordHint")} error={errorMessage(errors.password?.message)}>
          <PasswordInput
            {...fieldAria("password", errors.password?.message, true)}
            autoComplete="new-password"
            {...form.register("password")}
          />
        </Field>
        <Field id="birthDate" label={t("birthDate")} hint={t("birthDateHint")} error={errorMessage(errors.birthDate?.message)}>
          <Input
            {...fieldAria("birthDate", errors.birthDate?.message, true)}
            type="date"
            min="1900-01-01"
            autoComplete="bday"
            {...form.register("birthDate")}
          />
        </Field>
        <div className="space-y-2">
          <label className="flex cursor-pointer gap-3 text-sm leading-relaxed text-muted">
            <Checkbox aria-invalid={errors.acceptTerms ? true : undefined} {...form.register("acceptTerms")} />
            <span>
              {t.rich("acceptTerms", {
                terms: (chunks) => (
                  <Link href="/terms" target="_blank" className="text-accent hover:underline">
                    {chunks}
                  </Link>
                ),
                privacy: (chunks) => (
                  <Link href="/privacy" target="_blank" className="text-accent hover:underline">
                    {chunks}
                  </Link>
                ),
              })}
            </span>
          </label>
          {errors.acceptTerms && (
            <p role="alert" className="text-sm text-danger">
              {errorMessage(errors.acceptTerms.message)}
            </p>
          )}
        </div>
        {turnstile.widget}
        <Button type="submit" size="lg" className="w-full" disabled={isSubmitting}>
          {isSubmitting && <Spinner />}
          {turnstile.waiting ? t("verifying") : t("signup.submit")}
        </Button>
      </form>
    </div>
  );
}


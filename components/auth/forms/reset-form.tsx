"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { useForm } from "react-hook-form";

import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { fieldAria, Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { requestPasswordReset } from "@/lib/auth/actions";
import { resetRequestSchema, type ResetRequestInput } from "@/lib/validation/auth";

import { useTurnstile } from "../turnstile";
import { useErrorMessage } from "../use-error";
import { runAction } from "@/components/auth/run-action";
import { FormError } from "@/components/auth/form-error";

export function ResetForm() {
  const t = useTranslations("Auth");
  const errorMessage = useErrorMessage();
  const turnstile = useTurnstile();
  const [formError, setFormError] = useState<string>();
  const [formDetail, setFormDetail] = useState<string>();
  const [sentTo, setSentTo] = useState<string>();

  const form = useForm<ResetRequestInput>({ resolver: zodResolver(resetRequestSchema), defaultValues: { email: "" } });
  const { errors, isSubmitting } = form.formState;

  const onSubmit = form.handleSubmit(async (values) => {
    setFormError(undefined);
    setFormDetail(undefined);
    const captchaToken = await turnstile.getToken();
    const result = await runAction(() => requestPasswordReset({ ...values, captchaToken }));
    turnstile.reset();
    if (result.ok) setSentTo(values.email);
    else {
      setFormError(errorMessage(result.error));
      setFormDetail(result.error === "captchaFailed" ? (turnstile.lastError() ?? result.detail) : undefined);
    }
  });

  if (sentTo) return <Alert variant="success">{t("reset.sent", { email: sentTo })}</Alert>;

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
      {turnstile.widget}
      <Button type="submit" size="lg" className="w-full" disabled={isSubmitting}>
        {isSubmitting && <Spinner />}
        {turnstile.waiting ? t("verifying") : t("reset.submit")}
      </Button>
    </form>
  );
}

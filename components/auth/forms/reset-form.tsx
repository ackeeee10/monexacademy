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

export function ResetForm() {
  const t = useTranslations("Auth");
  const errorMessage = useErrorMessage();
  const turnstile = useTurnstile();
  const [formError, setFormError] = useState<string>();
  const [sentTo, setSentTo] = useState<string>();

  const form = useForm<ResetRequestInput>({ resolver: zodResolver(resetRequestSchema), defaultValues: { email: "" } });
  const { errors, isSubmitting } = form.formState;

  const onSubmit = form.handleSubmit(async (values) => {
    setFormError(undefined);
    const captchaToken = await turnstile.getToken();
    const result = await requestPasswordReset({ ...values, captchaToken });
    turnstile.reset();
    if (result.ok) setSentTo(values.email);
    else setFormError(errorMessage(result.error));
  });

  if (sentTo) return <Alert variant="success">{t("reset.sent", { email: sentTo })}</Alert>;

  return (
    <form onSubmit={onSubmit} noValidate className="space-y-5">
      {formError && <Alert variant="danger">{formError}</Alert>}
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
        {t("reset.submit")}
      </Button>
    </form>
  );
}

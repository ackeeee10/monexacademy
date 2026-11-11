"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { useForm } from "react-hook-form";

import { Button } from "@/components/ui/button";
import { fieldAria, Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { signOut, verifyMfaSignIn } from "@/lib/auth/actions";
import { totpCodeSchema, type TotpCodeInput } from "@/lib/validation/auth";

import { useErrorMessage } from "../use-error";
import { runAction } from "@/components/auth/run-action";
import { FormError } from "@/components/auth/form-error";

export function VerifyMfaForm() {
  const t = useTranslations("Auth");
  const errorMessage = useErrorMessage();
  const next = useSearchParams().get("next") ?? undefined;
  const [formError, setFormError] = useState<string>();

  const form = useForm<TotpCodeInput>({ resolver: zodResolver(totpCodeSchema), defaultValues: { code: "" } });
  const { errors, isSubmitting } = form.formState;

  const onSubmit = form.handleSubmit(async (values) => {
    setFormError(undefined);
    const result = await runAction(() => verifyMfaSignIn({ ...values, next }));
    if (!result.ok) {
      setFormError(errorMessage(result.error));
      form.setValue("code", "");
    }
  });

  return (
    <div className="space-y-5">
      <form onSubmit={onSubmit} noValidate className="space-y-5">
        {formError && <FormError message={formError} />}
        <Field id="code" label={t("mfa.code")} error={errorMessage(errors.code?.message)}>
          <Input
            {...fieldAria("code", errors.code?.message)}
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={6}
            autoFocus
            placeholder="000000"
            className="tabular h-12 text-center text-lg tracking-[0.5em]"
            {...form.register("code")}
          />
        </Field>
        <Button type="submit" size="lg" className="w-full" disabled={isSubmitting}>
          {isSubmitting && <Spinner />}
          {t("mfa.submit")}
        </Button>
      </form>
      <form action={signOut}>
        <Button type="submit" variant="link" className="w-full text-muted">
          {t("mfa.useOther")}
        </Button>
      </form>
    </div>
  );
}

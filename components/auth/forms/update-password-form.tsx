"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { ArrowRight } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { useForm } from "react-hook-form";

import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { fieldAria, Field } from "@/components/ui/field";
import { Spinner } from "@/components/ui/spinner";
import { Link } from "@/i18n/navigation";
import { updatePassword } from "@/lib/auth/actions";
import { newPasswordSchema, type NewPasswordInput } from "@/lib/validation/auth";

import { PasswordInput } from "../password-input";
import { useErrorMessage } from "../use-error";

type Props = {
  /** Where to go after saving; the settings page passes its own path. */
  doneHref?: string;
  submitLabel?: string;
};

export function UpdatePasswordForm({ doneHref = "/dashboard", submitLabel }: Props) {
  const t = useTranslations("Auth");
  const errorMessage = useErrorMessage();
  const [formError, setFormError] = useState<string>();
  const [done, setDone] = useState(false);

  const form = useForm<NewPasswordInput>({
    resolver: zodResolver(newPasswordSchema),
    defaultValues: { password: "", confirm: "" },
  });
  const { errors, isSubmitting } = form.formState;

  const onSubmit = form.handleSubmit(async (values) => {
    setFormError(undefined);
    const result = await updatePassword(values);
    if (result.ok) {
      setDone(true);
      form.reset();
    } else setFormError(errorMessage(result.error));
  });

  if (done) {
    return (
      <div className="space-y-5">
        <Alert variant="success">{t("update.done")}</Alert>
        {doneHref !== "" && (
          <Button asChild size="lg" className="w-full">
            <Link href={doneHref}>
              {t("update.continue")}
              <ArrowRight aria-hidden />
            </Link>
          </Button>
        )}
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} noValidate className="space-y-5">
      {formError && <Alert variant="danger">{formError}</Alert>}
      <Field id="new-password" label={t("newPassword")} hint={t("passwordHint")} error={errorMessage(errors.password?.message)}>
        <PasswordInput
          {...fieldAria("new-password", errors.password?.message, true)}
          autoComplete="new-password"
          {...form.register("password")}
        />
      </Field>
      <Field id="confirm-password" label={t("confirmPassword")} error={errorMessage(errors.confirm?.message)}>
        <PasswordInput
          {...fieldAria("confirm-password", errors.confirm?.message)}
          autoComplete="new-password"
          {...form.register("confirm")}
        />
      </Field>
      <Button type="submit" size="lg" className="w-full" disabled={isSubmitting}>
        {isSubmitting && <Spinner />}
        {submitLabel ?? t("update.submit")}
      </Button>
    </form>
  );
}

"use client";

import { useTranslations } from "next-intl";
import { useState, useTransition, type FormEvent } from "react";

import { runAction } from "@/components/auth/run-action";
import { useErrorMessage } from "@/components/auth/use-error";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field, fieldAria } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { useRouter } from "@/i18n/navigation";
import { confirmAge } from "@/lib/account/actions";

export function ConfirmAgeForm() {
  const t = useTranslations("ConfirmAge");
  const errorMessage = useErrorMessage();
  const router = useRouter();
  const [birthDate, setBirthDate] = useState("");
  const [error, setError] = useState<string>();
  const [pending, startTransition] = useTransition();

  const submit = (e: FormEvent) => {
    e.preventDefault();
    setError(undefined);
    startTransition(async () => {
      const result = await runAction(() => confirmAge({ birthDate }));
      if (!result.ok) {
        setError(errorMessage(result.fields?.birthDate ?? result.error));
        return;
      }
      router.replace(result.redirectTo ?? "/dashboard");
      router.refresh();
    });
  };

  return (
    <form onSubmit={submit} noValidate className="space-y-5">
      {error && <Alert variant="danger">{error}</Alert>}
      <Field id="confirm-birth-date" label={t("birthDate")}>
        <Input
          {...fieldAria("confirm-birth-date", error)}
          type="date"
          required
          value={birthDate}
          max={new Date().toISOString().slice(0, 10)}
          onChange={(e) => setBirthDate(e.target.value)}
        />
      </Field>
      <p className="text-xs text-muted">{t("note")}</p>
      <Button type="submit" className="w-full" disabled={pending || !birthDate}>
        {t("submit")}
      </Button>
    </form>
  );
}

"use client";

import { Check } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useState, type ComponentProps } from "react";

import { fieldAria, Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { checkUsernameAvailable } from "@/lib/account/actions";
import { USERNAME_PATTERN } from "@/lib/validation/shared";

import { useErrorMessage } from "../auth/use-error";

type UsernameFieldProps = {
  value: string;
  /** The user's current username (always counts as available). */
  current?: string | null;
  error?: string;
  inputProps: ComponentProps<"input">;
};

type Status = "idle" | "checking" | "available" | "taken";

/** Username input with a debounced live availability check. */
export function UsernameField({ value, current, error, inputProps }: UsernameFieldProps) {
  const t = useTranslations("Onboarding");
  const errorMessage = useErrorMessage();
  const [result, setResult] = useState<{ value: string; available: boolean | null } | null>(null);

  const normalized = value.trim().toLowerCase();
  const checkable = USERNAME_PATTERN.test(normalized) && normalized !== current;

  useEffect(() => {
    if (!checkable) return;
    let cancelled = false;
    const timer = setTimeout(async () => {
      const available = await checkUsernameAvailable(normalized).catch(() => null);
      if (!cancelled) setResult({ value: normalized, available });
    }, 400);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [normalized, checkable]);

  let status: Status = "idle";
  if (checkable) {
    if (result?.value !== normalized) status = "checking";
    else status = result.available === null ? "idle" : result.available ? "available" : "taken";
  }

  const shownError = error ? errorMessage(error) : status === "taken" ? errorMessage("usernameTaken") : undefined;

  return (
    <Field
      id="username"
      label={t("username")}
      hint={t("usernameHint")}
      error={shownError}
      aside={
        status === "checking" ? (
          <span className="flex items-center gap-1.5 text-xs text-muted">
            <Spinner className="size-3" /> {t("usernameChecking")}
          </span>
        ) : status === "available" ? (
          <span className="flex items-center gap-1 text-xs text-success">
            <Check className="size-3.5" aria-hidden /> {t("usernameAvailable")}
          </span>
        ) : null
      }
    >
      <div className="relative">
        <span className="pointer-events-none absolute inset-y-0 left-3.5 flex items-center text-sm text-muted">@</span>
        <Input
          {...fieldAria("username", shownError, true)}
          autoComplete="username"
          autoCapitalize="none"
          spellCheck={false}
          maxLength={20}
          className="pl-8"
          {...inputProps}
        />
      </div>
    </Field>
  );
}

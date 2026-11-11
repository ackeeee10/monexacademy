"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { ArrowLeft, ArrowRight } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { Controller, useForm, useWatch, type FieldPath } from "react-hook-form";

import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { ChoiceCard } from "@/components/ui/choice";
import { Checkbox, fieldAria, Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { Link } from "@/i18n/navigation";
import { completeOnboarding } from "@/lib/account/actions";
import type { Option } from "@/lib/account/queries";
import {
  BUDGETS,
  INTENTS,
  onboardingSchema,
  TEAM_MODES,
  WEEKLY_TIMES,
  WORK_PREFERENCES,
  type OnboardingInput,
} from "@/lib/validation/profile";

import { useErrorMessage } from "../auth/use-error";
import { MultiPicker } from "./pickers";
import { UsernameField } from "./username-field";

type Props = {
  needsBirthDate: boolean;
  needsTerms: boolean;
  suggestedUsername: string;
  categories: Option[];
  skills: Option[];
};

type StepKey = "account" | "intents" | "budget" | "mode" | "team" | "time" | "interests";

const STEP_FIELDS: Record<StepKey, FieldPath<OnboardingInput>[]> = {
  account: ["username", "birthDate", "acceptTerms"],
  intents: ["intents"],
  budget: ["budgetRange"],
  mode: ["workPreference"],
  team: ["teamMode"],
  time: ["weeklyTime"],
  interests: ["categories", "skills"],
};
const STEPS = Object.keys(STEP_FIELDS) as StepKey[];

export function OnboardingWizard({ needsBirthDate, needsTerms, suggestedUsername, categories, skills }: Props) {
  const t = useTranslations("Onboarding");
  const tAuth = useTranslations("Auth");
  const tOpt = useTranslations("Options");
  const errorMessage = useErrorMessage();
  const [step, setStep] = useState(0);
  const [direction, setDirection] = useState(1);
  const [formError, setFormError] = useState<string>();

  // Birth date and terms are validated only for accounts that still need them.
  const schema = onboardingSchema.superRefine((v, ctx) => {
    if (needsBirthDate && !v.birthDate) ctx.addIssue({ code: "custom", path: ["birthDate"], message: "birthDateInvalid" });
    if (needsTerms && !v.acceptTerms) ctx.addIssue({ code: "custom", path: ["acceptTerms"], message: "termsRequired" });
  });

  const form = useForm<OnboardingInput>({
    resolver: zodResolver(schema),
    mode: "onTouched",
    defaultValues: {
      username: suggestedUsername,
      birthDate: needsBirthDate ? "" : undefined,
      acceptTerms: undefined,
      intents: [],
      categories: [],
      skills: [],
    },
  });
  const { errors, isSubmitting } = form.formState;
  const usernameValue = useWatch({ control: form.control, name: "username" }) ?? "";
  const key = STEPS[step] ?? "account";
  const isLast = step === STEPS.length - 1;

  async function goNext() {
    setFormError(undefined);
    const valid = await form.trigger(STEP_FIELDS[key]);
    if (!valid) return;
    if (isLast) return submit();
    setDirection(1);
    setStep((s) => s + 1);
  }

  function goBack() {
    setDirection(-1);
    setStep((s) => Math.max(0, s - 1));
  }

  const submit = form.handleSubmit(async (values) => {
    const result = await completeOnboarding({
      ...values,
      birthDate: needsBirthDate ? values.birthDate : undefined,
      acceptTerms: needsTerms ? values.acceptTerms : undefined,
    });
    if (!result.ok) {
      setFormError(errorMessage(result.error));
      if (result.fields?.username || result.error === "mustBe18" || result.error === "termsRequired") {
        if (result.fields?.username) form.setError("username", { message: result.fields.username });
        setDirection(-1);
        setStep(0);
      }
    }
  });

  const single = <T extends string>(name: "budgetRange" | "workPreference" | "teamMode" | "weeklyTime", values: readonly T[], label: (v: T) => string) => (
    <Controller
      control={form.control}
      name={name}
      render={({ field }) => (
        <div role="radiogroup" className="grid gap-3 sm:grid-cols-2">
          {values.map((v) => (
            <ChoiceCard key={v} selected={field.value === v} onSelect={() => field.onChange(v)} title={label(v)} />
          ))}
        </div>
      )}
    />
  );

  const stepError = (name: FieldPath<OnboardingInput>) => {
    const message = name.split(".").reduce<unknown>((o, k) => (o as Record<string, unknown> | undefined)?.[k], errors) as
      | { message?: string }
      | undefined;
    return message?.message ? <p role="alert" className="text-sm text-danger">{errorMessage(message.message)}</p> : null;
  };

  return (
    <div className="mx-auto w-full max-w-2xl">
      <div className="mb-10">
        <div className="mb-3 flex items-center justify-between text-xs text-muted">
          <span className="tabular">{t("step", { current: step + 1, total: STEPS.length })}</span>
        </div>
        <div className="h-1 overflow-hidden rounded-full bg-surface-2" aria-hidden>
          <motion.div
            className="h-full rounded-full bg-accent"
            initial={false}
            animate={{ width: `${((step + 1) / STEPS.length) * 100}%` }}
            transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
          />
        </div>
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          void goNext();
        }}
        noValidate
      >
        <AnimatePresence mode="wait" custom={direction} initial={false}>
          <motion.section
            key={key}
            custom={direction}
            initial={{ opacity: 0, x: 24 * direction }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -24 * direction }}
            transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
            aria-labelledby={`step-${key}`}
          >
            <h1 id={`step-${key}`} className="text-3xl font-bold text-text md:text-4xl">
              {t(`steps.${key}.title`)}
            </h1>
            <p className="mt-3 text-muted">{t(`steps.${key}.body`)}</p>

            <div className="mt-8 space-y-6">
              {formError && <Alert variant="danger">{formError}</Alert>}

              {key === "account" && (
                <>
                  <UsernameField
                    value={usernameValue}
                    error={errors.username?.message}
                    inputProps={form.register("username")}
                  />
                  {needsBirthDate && (
                    <Field id="birthDate" label={tAuth("birthDate")} hint={tAuth("birthDateHint")} error={errorMessage(errors.birthDate?.message)}>
                      <Input
                        {...fieldAria("birthDate", errors.birthDate?.message, true)}
                        type="date"
                        min="1900-01-01"
                        autoComplete="bday"
                        {...form.register("birthDate")}
                      />
                    </Field>
                  )}
                  {needsTerms && (
                    <div className="space-y-2">
                      <label className="flex cursor-pointer gap-3 text-sm leading-relaxed text-muted">
                        <Checkbox aria-invalid={errors.acceptTerms ? true : undefined} {...form.register("acceptTerms")} />
                        <span>
                          {tAuth.rich("acceptTerms", {
                            terms: (c) => <Link href="/terms" target="_blank" className="text-accent hover:underline">{c}</Link>,
                            privacy: (c) => <Link href="/privacy" target="_blank" className="text-accent hover:underline">{c}</Link>,
                          })}
                        </span>
                      </label>
                      {stepError("acceptTerms")}
                    </div>
                  )}
                </>
              )}

              {key === "intents" && (
                <Controller
                  control={form.control}
                  name="intents"
                  render={({ field }) => (
                    <div className="grid gap-3">
                      {INTENTS.map((v) => (
                        <ChoiceCard
                          key={v}
                          multiple
                          selected={field.value.includes(v)}
                          onSelect={() =>
                            field.onChange(field.value.includes(v) ? field.value.filter((x) => x !== v) : [...field.value, v])
                          }
                          title={tOpt(`intents.${v}.title`)}
                          description={tOpt(`intents.${v}.body`)}
                        />
                      ))}
                    </div>
                  )}
                />
              )}
              {key === "budget" && single("budgetRange", BUDGETS, (v) => tOpt(`budget.${v}`))}
              {key === "mode" && single("workPreference", WORK_PREFERENCES, (v) => tOpt(`workPreference.${v}`))}
              {key === "team" && single("teamMode", TEAM_MODES, (v) => tOpt(`teamMode.${v}`))}
              {key === "time" && single("weeklyTime", WEEKLY_TIMES, (v) => tOpt(`weeklyTime.${v}`))}
              {key !== "account" && key !== "interests" && stepError(STEP_FIELDS[key][0] as FieldPath<OnboardingInput>)}

              {key === "interests" && (
                <div className="space-y-8">
                  <Controller
                    control={form.control}
                    name="categories"
                    render={({ field }) => (
                      <MultiPicker options={categories} value={field.value} onChange={field.onChange} max={20} label={t("categories")} />
                    )}
                  />
                  <Controller
                    control={form.control}
                    name="skills"
                    render={({ field }) => (
                      <MultiPicker options={skills} value={field.value} onChange={field.onChange} max={30} label={t("skills")} />
                    )}
                  />
                </div>
              )}
            </div>
          </motion.section>
        </AnimatePresence>

        <div className="mt-10 flex items-center justify-between gap-3 border-t border-border pt-6">
          <Button type="button" variant="ghost" onClick={goBack} disabled={step === 0 || isSubmitting} className={step === 0 ? "invisible" : ""}>
            <ArrowLeft aria-hidden />
            {t("back")}
          </Button>
          <Button type="submit" size="lg" disabled={isSubmitting}>
            {isSubmitting && <Spinner />}
            {isLast ? t("finish") : t("next")}
            {!isLast && !isSubmitting && <ArrowRight aria-hidden />}
          </Button>
        </div>
      </form>
    </div>
  );
}

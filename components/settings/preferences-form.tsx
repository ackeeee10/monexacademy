"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { Controller, useForm } from "react-hook-form";

import { MultiPicker } from "@/components/account/pickers";
import { useErrorMessage } from "@/components/auth/use-error";
import { Chip } from "@/components/ui/choice";
import { updatePreferences } from "@/lib/account/actions";
import type { Option } from "@/lib/account/queries";
import {
  BUDGETS,
  INTENTS,
  preferencesSchema,
  TEAM_MODES,
  WEEKLY_TIMES,
  WORK_PREFERENCES,
  type PreferencesInput,
} from "@/lib/validation/profile";

import { SaveBar } from "./save-bar";
import { SettingsSection } from "./section";

const schema = preferencesSchema.omit({ skills: true });
type Values = Omit<PreferencesInput, "skills">;

type Props = { initial: Partial<Values>; categories: Option[] };

export function PreferencesForm({ initial, categories }: Props) {
  const t = useTranslations("Settings");
  const tOnb = useTranslations("Onboarding");
  const tOpt = useTranslations("Options");
  const errorMessage = useErrorMessage();
  const [saved, setSaved] = useState(false);
  const [formError, setFormError] = useState<string>();

  const form = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: { intents: [], categories: [], ...initial },
  });
  const { errors, isSubmitting } = form.formState;

  const onSubmit = form.handleSubmit(async (values) => {
    setSaved(false);
    setFormError(undefined);
    const result = await updatePreferences(values);
    if (result.ok) setSaved(true);
    else setFormError(errorMessage(result.error));
  });

  const singleGroup = <T extends string>(
    name: "budgetRange" | "workPreference" | "teamMode" | "weeklyTime",
    legend: string,
    values: readonly T[],
    label: (v: T) => string,
  ) => (
    <Controller
      control={form.control}
      name={name}
      render={({ field }) => (
        <fieldset className="space-y-3">
          <legend className="text-sm font-medium text-text">{legend}</legend>
          <div role="radiogroup" className="flex flex-wrap gap-2">
            {values.map((v) => (
              <Chip
                key={v}
                selected={field.value === v}
                onToggle={() => {
                  setSaved(false);
                  field.onChange(v);
                }}
              >
                {label(v)}
              </Chip>
            ))}
          </div>
          {errors[name] && <p role="alert" className="text-sm text-danger">{errorMessage(errors[name]?.message)}</p>}
        </fieldset>
      )}
    />
  );

  return (
    <form onSubmit={onSubmit} noValidate>
      <SettingsSection title={t("preferences.title")} description={t("preferences.body")}>
        <div className="space-y-8">
          <Controller
            control={form.control}
            name="intents"
            render={({ field }) => (
              <fieldset className="space-y-3">
                <legend className="text-sm font-medium text-text">{tOnb("steps.intents.title")}</legend>
                <div className="flex flex-wrap gap-2">
                  {INTENTS.map((v) => (
                    <Chip
                      key={v}
                      selected={field.value.includes(v)}
                      onToggle={() => {
                        setSaved(false);
                        field.onChange(field.value.includes(v) ? field.value.filter((x) => x !== v) : [...field.value, v]);
                      }}
                    >
                      {tOpt(`intents.${v}.title`)}
                    </Chip>
                  ))}
                </div>
                {errors.intents && <p role="alert" className="text-sm text-danger">{errorMessage(errors.intents.message)}</p>}
              </fieldset>
            )}
          />
          {singleGroup("budgetRange", tOnb("steps.budget.title"), BUDGETS, (v) => tOpt(`budget.${v}`))}
          {singleGroup("workPreference", tOnb("steps.mode.title"), WORK_PREFERENCES, (v) => tOpt(`workPreference.${v}`))}
          {singleGroup("teamMode", tOnb("steps.team.title"), TEAM_MODES, (v) => tOpt(`teamMode.${v}`))}
          {singleGroup("weeklyTime", tOnb("steps.time.title"), WEEKLY_TIMES, (v) => tOpt(`weeklyTime.${v}`))}
          <Controller
            control={form.control}
            name="categories"
            render={({ field }) => (
              <MultiPicker
                options={categories}
                value={field.value}
                onChange={(v) => {
                  setSaved(false);
                  field.onChange(v);
                }}
                max={20}
                label={tOnb("categories")}
              />
            )}
          />
          <SaveBar pending={isSubmitting} saved={saved} error={formError} />
        </div>
      </SettingsSection>
    </form>
  );
}

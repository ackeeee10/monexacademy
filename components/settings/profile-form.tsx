"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Plus, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { Controller, useFieldArray, useForm, useWatch } from "react-hook-form";

import { MultiPicker } from "@/components/account/pickers";
import { UsernameField } from "@/components/account/username-field";
import { useErrorMessage } from "@/components/auth/use-error";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Chip } from "@/components/ui/choice";
import { fieldAria, Field, Select, Textarea } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { updateProfile } from "@/lib/account/actions";
import type { Option } from "@/lib/account/queries";
import { LOOKING_FOR, profileSchema, type ProfileInput, type ProfileOutput } from "@/lib/validation/profile";

import { SaveBar } from "./save-bar";
import { SettingsSection } from "./section";

type Props = {
  initial: ProfileInput;
  /** Sorted on the server so names match exactly during hydration. */
  countries: { code: string; name: string }[];
  avatarUrl: string | null;
  skills: Option[];
};

export function ProfileForm({ initial, avatarUrl, skills, countries }: Props) {
  const t = useTranslations("Settings");
  const tOpt = useTranslations("Options");
  const errorMessage = useErrorMessage();
  const [saved, setSaved] = useState(false);
  const [formError, setFormError] = useState<string>();
  const [currentUsername, setCurrentUsername] = useState(initial.username);

  const form = useForm<ProfileInput, unknown, ProfileOutput>({ resolver: zodResolver(profileSchema), defaultValues: initial });
  const { errors, isSubmitting } = form.formState;
  const links = useFieldArray({ control: form.control, name: "links" });
  const portfolio = useFieldArray({ control: form.control, name: "portfolio" });
  const [username, bio, experience] = useWatch({ control: form.control, name: ["username", "bio", "experience"] });

  // Send the raw form values; the server validates and normalises them again.
  const onSubmit = form.handleSubmit(async () => {
    const values = form.getValues();
    setSaved(false);
    setFormError(undefined);
    const result = await updateProfile(values);
    if (result.ok) {
      setSaved(true);
      setCurrentUsername(values.username);
      form.reset(values);
    } else {
      setFormError(errorMessage(result.error));
      for (const [name, message] of Object.entries(result.fields ?? {})) {
        form.setError(name as keyof ProfileInput, { message });
      }
    }
  });

  const counter = (value: string | undefined, max: number) =>
    t("profile.characters", { count: (value ?? "").length, max });

  return (
    <form onSubmit={onSubmit} noValidate onChange={() => setSaved(false)}>
      <SettingsSection title={t("profile.title")} description={t("profile.body")}>
        <div className="space-y-6">
          <div className="flex items-center gap-4">
            <Avatar name={username ?? ""} src={avatarUrl} className="size-16 text-base" />
            <p className="text-sm text-muted">{t("profile.avatarHint")}</p>
          </div>

          <UsernameField
            value={username ?? ""}
            current={currentUsername}
            error={errors.username?.message}
            inputProps={form.register("username")}
          />

          <Field id="bio" label={t("profile.bio")} hint={counter(bio ?? "", 500)} error={errorMessage(errors.bio?.message)}>
            <Textarea
              {...fieldAria("bio", errors.bio?.message, true)}
              maxLength={500}
              placeholder={t("profile.bioPlaceholder")}
              {...form.register("bio")}
            />
          </Field>

          <Field id="experience" label={t("profile.experience")} hint={counter(experience ?? "", 2000)} error={errorMessage(errors.experience?.message)}>
            <Textarea
              {...fieldAria("experience", errors.experience?.message, true)}
              maxLength={2000}
              className="min-h-36"
              placeholder={t("profile.experiencePlaceholder")}
              {...form.register("experience")}
            />
          </Field>

          <div className="grid gap-6 sm:grid-cols-2">
            <Field id="country" label={t("profile.country")} error={errorMessage(errors.country?.message)}>
              <Select {...fieldAria("country", errors.country?.message)} {...form.register("country")}>
                <option value="">{t("profile.countryPlaceholder")}</option>
                {countries.map((c) => (
                  <option key={c.code} value={c.code}>
                    {c.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field id="city" label={t("profile.city")} error={errorMessage(errors.city?.message)}>
              <Input {...fieldAria("city", errors.city?.message)} maxLength={80} autoComplete="address-level2" {...form.register("city")} />
            </Field>
          </div>

          <Field id="availability" label={t("profile.availability")} error={errorMessage(errors.availabilityHours?.message)} className="sm:max-w-xs">
            <Input
              {...fieldAria("availability", errors.availabilityHours?.message)}
              type="number"
              inputMode="numeric"
              min={0}
              max={80}
              className="tabular"
              {...form.register("availabilityHours")}
            />
          </Field>

          <Controller
            control={form.control}
            name="lookingFor"
            render={({ field }) => (
              <fieldset className="space-y-3">
                <legend className="text-sm font-medium text-text">{t("profile.lookingFor")}</legend>
                <div className="flex flex-wrap gap-2">
                  {LOOKING_FOR.map((v) => (
                    <Chip
                      key={v}
                      selected={field.value.includes(v)}
                      onToggle={() => {
                        setSaved(false);
                        field.onChange(field.value.includes(v) ? field.value.filter((x) => x !== v) : [...field.value, v]);
                      }}
                    >
                      {tOpt(`lookingFor.${v}`)}
                    </Chip>
                  ))}
                </div>
              </fieldset>
            )}
          />

          <Controller
            control={form.control}
            name="skills"
            render={({ field }) => (
              <MultiPicker
                options={skills}
                value={field.value}
                onChange={(v) => {
                  setSaved(false);
                  field.onChange(v);
                }}
                max={30}
                label={t("profile.skills")}
              />
            )}
          />

          <RepeatList
            legend={t("profile.links")}
            addLabel={t("profile.addLink")}
            canAdd={links.fields.length < 10}
            onAdd={() => links.append({ label: "", url: "" })}
          >
            {links.fields.map((item, i) => (
              <RepeatRow key={item.id} onRemove={() => links.remove(i)} removeLabel={t("profile.remove")}>
                <Input aria-label={t("profile.linkLabel")} placeholder={t("profile.linkLabel")} maxLength={40} className="sm:w-40" aria-invalid={errors.links?.[i]?.label ? true : undefined} {...form.register(`links.${i}.label`)} />
                <Input aria-label={t("profile.linkUrl")} placeholder={t("profile.linkUrl")} type="url" aria-invalid={errors.links?.[i]?.url ? true : undefined} {...form.register(`links.${i}.url`)} />
                <RowError message={errorMessage(errors.links?.[i]?.label?.message ?? errors.links?.[i]?.url?.message)} />
              </RepeatRow>
            ))}
          </RepeatList>

          <RepeatList
            legend={t("profile.portfolio")}
            addLabel={t("profile.addPortfolio")}
            canAdd={portfolio.fields.length < 10}
            onAdd={() => portfolio.append({ title: "", url: "" })}
          >
            {portfolio.fields.map((item, i) => (
              <RepeatRow key={item.id} onRemove={() => portfolio.remove(i)} removeLabel={t("profile.remove")}>
                <Input aria-label={t("profile.portfolioTitle")} placeholder={t("profile.portfolioTitle")} maxLength={80} className="sm:w-56" aria-invalid={errors.portfolio?.[i]?.title ? true : undefined} {...form.register(`portfolio.${i}.title`)} />
                <Input aria-label={t("profile.portfolioUrl")} placeholder={t("profile.portfolioUrl")} type="url" aria-invalid={errors.portfolio?.[i]?.url ? true : undefined} {...form.register(`portfolio.${i}.url`)} />
                <RowError message={errorMessage(errors.portfolio?.[i]?.title?.message ?? errors.portfolio?.[i]?.url?.message)} />
              </RepeatRow>
            ))}
          </RepeatList>

          <SaveBar pending={isSubmitting} saved={saved} error={formError} />
        </div>
      </SettingsSection>
    </form>
  );
}

function RepeatList({
  legend,
  addLabel,
  canAdd,
  onAdd,
  children,
}: {
  legend: string;
  addLabel: string;
  canAdd: boolean;
  onAdd: () => void;
  children: React.ReactNode;
}) {
  return (
    <fieldset className="space-y-3">
      <legend className="text-sm font-medium text-text">{legend}</legend>
      <div className="space-y-3">{children}</div>
      {canAdd && (
        <Button type="button" variant="secondary" size="sm" onClick={onAdd}>
          <Plus aria-hidden />
          {addLabel}
        </Button>
      )}
    </fieldset>
  );
}

function RepeatRow({ children, onRemove, removeLabel }: { children: React.ReactNode; onRemove: () => void; removeLabel: string }) {
  return (
    <div className="flex flex-wrap items-start gap-2 sm:flex-nowrap">
      {children}
      <Button type="button" variant="ghost" size="icon" onClick={onRemove} aria-label={removeLabel} className="shrink-0">
        <X aria-hidden />
      </Button>
    </div>
  );
}

function RowError({ message }: { message?: string }) {
  if (!message) return null;
  return (
    <p role="alert" className="order-last w-full text-sm text-danger">
      {message}
    </p>
  );
}

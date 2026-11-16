"use client";

import { ArrowLeft, ArrowRight, Plus, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";

import { runAction } from "@/components/auth/run-action";
import { useErrorMessage } from "@/components/auth/use-error";
import { MultiPicker } from "@/components/account/pickers";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { ChoiceCard } from "@/components/ui/choice";
import { Field, Select, Textarea, fieldAria } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Link, useRouter } from "@/i18n/navigation";
import { saveIdeaAction } from "@/lib/ideas/actions";
import { type FormCategory, type FormSkill, type IdeaFormValues } from "@/lib/ideas/form-values";
import { MAX_LAUNCH_STEPS, MAX_ROLES, STEP_FIELDS, ideaSchema, DIFFICULTIES, TIME_TO_INCOME, type IdeaInput } from "@/lib/validation/idea";
import { BUDGETS, TEAM_MODES, WORK_PREFERENCES } from "@/lib/validation/profile";

const STEP_COUNT = 5; // four input steps + review

function toInput(v: IdeaFormValues): IdeaInput {
  return {
    title: v.title,
    shortDescription: v.shortDescription,
    categoryId: v.categoryId,
    investmentRange: v.investmentRange as IdeaInput["investmentRange"],
    earningMin: v.earningMin === "" ? Number.NaN : Number(v.earningMin),
    earningMax: v.earningMax === "" ? Number.NaN : Number(v.earningMax),
    difficulty: v.difficulty as IdeaInput["difficulty"],
    timeToFirstIncome: v.timeToFirstIncome as IdeaInput["timeToFirstIncome"],
    workMode: v.workMode as IdeaInput["workMode"],
    teamMode: v.teamMode as IdeaInput["teamMode"],
    skillIds: v.skillIds,
    lookingForRoles: v.lookingForRoles,
    launchPlan: v.launchPlan.map((s) => s.trim()).filter((s) => s.length > 0),
    marketAnalysis: v.marketAnalysis,
    risks: v.risks,
  };
}

type Props = {
  ideaId: string | null;
  initialValues: IdeaFormValues;
  categories: FormCategory[];
  skills: FormSkill[];
  /** The author's credit balance, shown when an extra post must be paid for. */
  credits: number;
};

export function IdeaForm({ ideaId, initialValues, categories, skills, credits }: Props) {
  const t = useTranslations("Ideas.create");
  const tOpt = useTranslations("Options");
  const tIdeas = useTranslations("Ideas");
  const errorMessage = useErrorMessage();
  const router = useRouter();

  const [values, setValues] = useState<IdeaFormValues>(initialValues);
  const [id, setId] = useState<string | null>(ideaId);
  const [step, setStep] = useState(0);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [notice, setNotice] = useState<{ tone: "success" | "danger"; text: string } | null>(null);
  const [pending, startTransition] = useTransition();
  const [roleDraft, setRoleDraft] = useState("");
  /** Set when the plan's free posts are used up: credits the extra post costs. */
  const [extraCost, setExtraCost] = useState<number | null>(null);

  const set = <K extends keyof IdeaFormValues>(key: K, value: IdeaFormValues[K]) =>
    setValues((prev) => ({ ...prev, [key]: value }));

  /** Field errors from Zod, keyed by top-level field name, as translated text. */
  const collect = (): Record<string, string> => {
    const parsed = ideaSchema.safeParse(toInput(values));
    if (parsed.success) return {};
    const out: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      const key = String(issue.path[0] ?? "");
      if (key && !out[key]) out[key] = errorMessage(issue.message) ?? issue.message;
    }
    return out;
  };

  const goNext = () => {
    const all = collect();
    const current = STEP_FIELDS[step] as readonly string[];
    const stepErrors = Object.fromEntries(Object.entries(all).filter(([k]) => current.includes(k)));
    setErrors(stepErrors);
    if (Object.keys(stepErrors).length === 0) {
      setNotice(null);
      setStep((s) => Math.min(s + 1, STEP_COUNT - 1));
    }
  };

  const submit = (submitForReview: boolean, payExtra = false) => {
    const all = collect();
    setErrors(all);
    if (Object.keys(all).length > 0) {
      // Jump to the first step that has a problem.
      const firstBad = STEP_FIELDS.findIndex((fields) => fields.some((f) => all[f]));
      if (firstBad >= 0) setStep(firstBad);
      setNotice({ tone: "danger", text: t("unexpected") });
      return;
    }

    setNotice(null);
    startTransition(async () => {
      const result = await runAction(() => saveIdeaAction(id, toInput(values), submitForReview, payExtra));
      if (!result.ok && result.error === "postLimitReached") {
        setExtraCost(Number(result.detail) || 0);
        return;
      }
      if (!result.ok) {
        if (result.fields) {
          const mapped = Object.fromEntries(
            Object.entries(result.fields).map(([k, v]) => [k, errorMessage(v) ?? v]),
          );
          setErrors(mapped);
        }
        setNotice({ tone: "danger", text: errorMessage(result.error) ?? t("unexpected") });
        return;
      }
      if (submitForReview) {
        router.push(`/ideas/${result.data.slug}`);
        return;
      }
      setId(result.data.id);
      setNotice({ tone: "success", text: t("draftSaved") });
      router.replace(`/create/idea?id=${result.data.id}`);
    });
  };

  const addRole = () => {
    const role = roleDraft.trim();
    if (!role || values.lookingForRoles.length >= MAX_ROLES) return;
    if (!values.lookingForRoles.includes(role)) set("lookingForRoles", [...values.lookingForRoles, role]);
    setRoleDraft("");
  };

  const err = (key: string) => errors[key];
  // Keys built from form strings (already validated by the select options).
  const optLabel = (key: string) => tOpt(key as never);
  const ideasLabel = (key: string) => tIdeas(key as never);

  return (
    <div className="space-y-8">
      <Stepper step={step} labels={[
        t("steps.basics"), t("steps.numbers"), t("steps.how"), t("steps.plan"), t("steps.review"),
      ]} />

      <p className="text-sm text-muted" aria-live="polite">
        {t("stepOf", { current: step + 1, total: STEP_COUNT })}
      </p>

      {notice && <Alert variant={notice.tone === "success" ? "success" : "danger"}>{notice.text}</Alert>}

      <form
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          if (step < STEP_COUNT - 1) goNext();
        }}
        className="space-y-7"
      >
        {step === 0 && (
          <>
            <Field id="title" label={t("fields.title")} hint={t("fields.titleHint")} error={err("title")}>
              <Input
                {...fieldAria("title", err("title"), true)}
                value={values.title}
                maxLength={90}
                placeholder={t("placeholders.title")}
                onChange={(e) => set("title", e.target.value)}
              />
            </Field>
            <Field id="shortDescription" label={t("fields.shortDescription")} hint={t("fields.shortDescriptionHint")} error={err("shortDescription")}>
              <Textarea
                {...fieldAria("shortDescription", err("shortDescription"), true)}
                value={values.shortDescription}
                maxLength={280}
                className="min-h-24"
                placeholder={t("placeholders.shortDescription")}
                onChange={(e) => set("shortDescription", e.target.value)}
              />
            </Field>
            <Field id="categoryId" label={t("fields.category")} error={err("categoryId")}>
              <Select {...fieldAria("categoryId", err("categoryId"))} value={values.categoryId} onChange={(e) => set("categoryId", e.target.value)}>
                <option value="" disabled>—</option>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </Select>
            </Field>
          </>
        )}

        {step === 1 && (
          <>
            <Field id="investmentRange" label={t("fields.investment")} hint={t("fields.investmentHint")} error={err("investmentRange")}>
              <Select {...fieldAria("investmentRange", err("investmentRange"), true)} value={values.investmentRange} onChange={(e) => set("investmentRange", e.target.value)}>
                <option value="" disabled>—</option>
                {BUDGETS.map((b) => (
                  <option key={b} value={b}>{tOpt(`budget.${b}`)}</option>
                ))}
              </Select>
            </Field>
            <div className="grid gap-5 md:grid-cols-2">
              <Field id="earningMin" label={t("fields.earningMin")} hint={t("fields.earningHint")} error={err("earningMin")}>
                <Input
                  {...fieldAria("earningMin", err("earningMin"), true)}
                  type="number"
                  inputMode="numeric"
                  min={0}
                  step={1}
                  value={values.earningMin}
                  onChange={(e) => set("earningMin", e.target.value)}
                />
              </Field>
              <Field id="earningMax" label={t("fields.earningMax")} error={err("earningMax")}>
                <Input
                  {...fieldAria("earningMax", err("earningMax"))}
                  type="number"
                  inputMode="numeric"
                  min={0}
                  step={1}
                  value={values.earningMax}
                  onChange={(e) => set("earningMax", e.target.value)}
                />
              </Field>
            </div>
            <Field id="difficulty" label={t("fields.difficulty")} error={err("difficulty")}>
              <Select {...fieldAria("difficulty", err("difficulty"))} value={values.difficulty} onChange={(e) => set("difficulty", e.target.value)}>
                <option value="" disabled>—</option>
                {DIFFICULTIES.map((d) => (
                  <option key={d} value={d}>{tOpt(`difficulty.${d}`)}</option>
                ))}
              </Select>
            </Field>
            <Field id="timeToFirstIncome" label={t("fields.timeToIncome")} error={err("timeToFirstIncome")}>
              <Select {...fieldAria("timeToFirstIncome", err("timeToFirstIncome"))} value={values.timeToFirstIncome} onChange={(e) => set("timeToFirstIncome", e.target.value)}>
                <option value="" disabled>—</option>
                {TIME_TO_INCOME.map((x) => (
                  <option key={x} value={x}>{tOpt(`timeToIncome.${x}`)}</option>
                ))}
              </Select>
            </Field>
          </>
        )}

        {step === 2 && (
          <>
            <fieldset className="space-y-3">
              <legend className="mb-3 text-sm font-medium text-text">{t("fields.workMode")}</legend>
              <div className="grid gap-3 md:grid-cols-3">
                {WORK_PREFERENCES.map((m) => (
                  <ChoiceCard key={m} selected={values.workMode === m} onSelect={() => set("workMode", m)} title={tIdeas(`modeLabels.${m}`)} />
                ))}
              </div>
              {err("workMode") && <p role="alert" className="text-sm text-danger">{err("workMode")}</p>}
            </fieldset>
            <fieldset className="space-y-3">
              <legend className="mb-3 text-sm font-medium text-text">{t("fields.teamMode")}</legend>
              <div className="grid gap-3 md:grid-cols-2">
                {TEAM_MODES.map((m) => (
                  <ChoiceCard key={m} selected={values.teamMode === m} onSelect={() => set("teamMode", m)} title={tIdeas(`teamLabels.${m}`)} />
                ))}
              </div>
              {err("teamMode") && <p role="alert" className="text-sm text-danger">{err("teamMode")}</p>}
            </fieldset>
            <div className="space-y-2">
              <MultiPicker
                label={t("fields.skills")}
                options={skills}
                value={values.skillIds}
                onChange={(v) => set("skillIds", v)}
                max={30}
              />
              <p className="text-xs text-muted">{t("fields.skillsHint")}</p>
              {err("skillIds") && <p role="alert" className="text-sm text-danger">{err("skillIds")}</p>}
            </div>
            <Field id="roleDraft" label={t("fields.lookingForRoles")} hint={t("fields.lookingForRolesHint")} error={err("lookingForRoles")}>
              <div className="flex gap-2">
                <Input
                  id="roleDraft"
                  value={roleDraft}
                  maxLength={30}
                  placeholder={t("placeholders.roleInput")}
                  onChange={(e) => setRoleDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      addRole();
                    }
                  }}
                />
                <Button type="button" variant="secondary" onClick={addRole} disabled={values.lookingForRoles.length >= MAX_ROLES}>
                  <Plus aria-hidden />
                  {t("addRole")}
                </Button>
              </div>
              {values.lookingForRoles.length > 0 && (
                <ul className="flex flex-wrap gap-2 pt-1">
                  {values.lookingForRoles.map((role) => (
                    <li key={role} className="inline-flex items-center gap-1.5 rounded-full border border-border bg-surface-2 py-1 pl-3 pr-1.5 text-sm text-text">
                      {role}
                      <button
                        type="button"
                        aria-label={`${t("removeStep")} ${role}`}
                        onClick={() => set("lookingForRoles", values.lookingForRoles.filter((r) => r !== role))}
                        className="rounded-full p-0.5 text-muted hover:text-text"
                      >
                        <X className="size-3.5" aria-hidden />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </Field>
          </>
        )}

        {step === 3 && (
          <>
            <fieldset className="space-y-3">
              <legend className="text-sm font-medium text-text">{t("fields.launchPlan")}</legend>
              <p className="text-xs text-muted">{t("fields.launchPlanHint")}</p>
              <ol className="space-y-3">
                {values.launchPlan.map((step, i) => (
                  <li key={i} className="flex items-start gap-3">
                    <span className="tabular mt-2.5 w-6 shrink-0 text-right text-sm text-accent">{i + 1}.</span>
                    <Input
                      aria-label={`${t("fields.launchPlan")} ${i + 1}`}
                      value={step}
                      maxLength={200}
                      placeholder={t("placeholders.planStep")}
                      onChange={(e) =>
                        set("launchPlan", values.launchPlan.map((s, j) => (j === i ? e.target.value : s)))
                      }
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      aria-label={`${t("removeStep")} ${i + 1}`}
                      disabled={values.launchPlan.length <= 1}
                      onClick={() => set("launchPlan", values.launchPlan.filter((_, j) => j !== i))}
                    >
                      <X aria-hidden />
                    </Button>
                  </li>
                ))}
              </ol>
              <Button
                type="button"
                variant="secondary"
                size="sm"
                disabled={values.launchPlan.length >= MAX_LAUNCH_STEPS}
                onClick={() => set("launchPlan", [...values.launchPlan, ""])}
              >
                <Plus aria-hidden />
                {t("addStep")}
              </Button>
              {err("launchPlan") && <p role="alert" className="text-sm text-danger">{err("launchPlan")}</p>}
            </fieldset>
            <Field id="marketAnalysis" label={t("fields.marketAnalysis")} error={err("marketAnalysis")}>
              <Textarea
                {...fieldAria("marketAnalysis", err("marketAnalysis"))}
                value={values.marketAnalysis}
                maxLength={4000}
                placeholder={t("placeholders.marketAnalysis")}
                onChange={(e) => set("marketAnalysis", e.target.value)}
              />
            </Field>
            <Field id="risks" label={t("fields.risks")} error={err("risks")}>
              <Textarea
                {...fieldAria("risks", err("risks"))}
                value={values.risks}
                maxLength={4000}
                placeholder={t("placeholders.risks")}
                onChange={(e) => set("risks", e.target.value)}
              />
            </Field>
          </>
        )}

        {step === 4 && (
          <div className="space-y-6">
            <p className="text-sm leading-relaxed text-muted">{t("reviewIntro")}</p>
            <dl className="grid gap-4 rounded-lg border border-border bg-surface p-6 md:grid-cols-2">
              <Summary label={t("fields.title")} value={values.title} />
              <Summary label={t("fields.category")} value={categories.find((c) => c.id === values.categoryId)?.name ?? ""} />
              <Summary label={t("fields.investment")} value={values.investmentRange ? optLabel(`budget.${values.investmentRange}`) : ""} />
              <Summary label={t("fields.earningMin")} value={values.earningMin ? `$${values.earningMin} – $${values.earningMax || "?"}` : ""} />
              <Summary label={t("fields.difficulty")} value={values.difficulty ? optLabel(`difficulty.${values.difficulty}`) : ""} />
              <Summary label={t("fields.timeToIncome")} value={values.timeToFirstIncome ? optLabel(`timeToIncome.${values.timeToFirstIncome}`) : ""} />
              <Summary label={t("fields.workMode")} value={values.workMode ? ideasLabel(`modeLabels.${values.workMode}`) : ""} />
              <Summary label={t("fields.teamMode")} value={values.teamMode ? ideasLabel(`teamLabels.${values.teamMode}`) : ""} />
              <Summary label={t("fields.skills")} value={skills.filter((s) => values.skillIds.includes(s.id)).map((s) => s.name).join(", ")} />
              <Summary label={t("fields.launchPlan")} value={`${values.launchPlan.filter((s) => s.trim()).length}`} />
            </dl>
            {Object.keys(errors).length > 0 && (
              <p role="alert" className="text-sm text-danger">{t("unexpected")}</p>
            )}
          </div>
        )}

        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-6">
          <Button type="button" variant="ghost" onClick={() => setStep((s) => Math.max(0, s - 1))} disabled={step === 0 || pending}>
            <ArrowLeft aria-hidden />
            {t("back")}
          </Button>

          {step < STEP_COUNT - 1 ? (
            <Button type="button" onClick={goNext} disabled={pending}>
              {t("next")}
              <ArrowRight aria-hidden />
            </Button>
          ) : extraCost !== null ? (
            <div className="w-full space-y-3 rounded-lg border border-accent/40 bg-accent/[0.06] p-4">
              <p className="font-medium text-text">{t("extraPostTitle")}</p>
              <p className="text-sm text-muted">{t("extraPostBody", { cost: extraCost, count: credits })}</p>
              {credits < extraCost ? (
                <div className="flex flex-wrap items-center gap-3">
                  <p className="text-sm text-danger">{t("extraPostNoCredits")}</p>
                  <Button asChild size="sm" variant="secondary">
                    <Link href="/pricing">{t("seePricing")}</Link>
                  </Button>
                  <Button type="button" size="sm" variant="ghost" onClick={() => setExtraCost(null)}>{t("cancel")}</Button>
                </div>
              ) : (
                <div className="flex flex-wrap gap-3">
                  <Button type="button" onClick={() => submit(true, true)} disabled={pending}>
                    {pending ? t("saving") : t("extraPostPay")}
                  </Button>
                  <Button type="button" variant="ghost" onClick={() => setExtraCost(null)} disabled={pending}>{t("cancel")}</Button>
                </div>
              )}
            </div>
          ) : (
            <div className="flex flex-wrap gap-3">
              <Button type="button" variant="secondary" onClick={() => submit(false)} disabled={pending}>
                {pending ? t("saving") : t("saveDraft")}
              </Button>
              <Button type="button" onClick={() => submit(true)} disabled={pending}>
                {pending ? t("saving") : t("submit")}
              </Button>
            </div>
          )}
        </div>
      </form>
    </div>
  );
}

function Stepper({ step, labels }: { step: number; labels: string[] }) {
  return (
    <ol className="grid grid-cols-5 gap-2" aria-label="Progress">
      {labels.map((label, i) => (
        <li key={label} className="space-y-2">
          <div className={`h-1 rounded-full transition-colors duration-300 ${i <= step ? "bg-accent" : "bg-border"}`} />
          <span className={`block truncate text-xs ${i === step ? "text-text" : "text-muted"}`}>{label}</span>
        </li>
      ))}
    </ol>
  );
}

function Summary({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs text-muted">{label}</dt>
      <dd className="mt-1 text-sm text-text">{value || "—"}</dd>
    </div>
  );
}

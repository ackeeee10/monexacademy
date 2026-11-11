"use server";

import { updateTag } from "next/cache";
import { getLocale } from "next-intl/server";
import type { z } from "zod";

import { redirect } from "@/i18n/navigation";
import { getAccount } from "@/lib/auth/account";
import type { ActionResult, AuthErrorKey } from "@/lib/auth/types";
import { createClient } from "@/lib/supabase/server";
import {
  deleteAccountSchema,
  onboardingSchema,
  preferencesSchema,
  profileSchema,
  usernameSchema,
  type DeleteAccountInput,
  type OnboardingInput,
  type PreferencesInput,
  type ProfileInput,
} from "@/lib/validation/profile";

function fieldErrors(error: z.ZodError): ActionResult {
  const fields: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = issue.path.join(".");
    if (key && !fields[key]) fields[key] = issue.message;
  }
  return { ok: false, error: "invalidInput", fields };
}

/** Maps errors raised by our Postgres functions (`raise exception '<key>'`). */
function dbErrorKey(message: string | undefined): AuthErrorKey {
  if (!message) return "unexpected";
  if (message.includes("username_taken") || message.includes("profiles_username_key")) return "usernameTaken";
  if (message.includes("must_be_18")) return "mustBe18";
  if (message.includes("terms_required")) return "termsRequired";
  if (message.includes("intents_required")) return "intentsRequired";
  console.error("[account]", message);
  return "unexpected";
}

const preferencesOnlySchema = preferencesSchema.omit({ skills: true });

/** Live username check. Returns null when the check itself failed (unknown). */
export async function checkUsernameAvailable(value: string): Promise<boolean | null> {
  const parsed = usernameSchema.safeParse(value);
  if (!parsed.success) return false;
  try {
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("is_username_available", { p_username: parsed.data });
    return error ? null : data === true;
  } catch {
    return null;
  }
}

export async function completeOnboarding(input: OnboardingInput): Promise<ActionResult> {
  const parsed = onboardingSchema.safeParse(input);
  if (!parsed.success) return fieldErrors(parsed.error);
  const v = parsed.data;

  const account = await getAccount();
  if (!account) return { ok: false, error: "sessionExpired" };
  if (!account.hasBirthDate && !v.birthDate) return { ok: false, error: "mustBe18", fields: { birthDate: "required" } };
  if (!account.hasAcceptedTerms && !v.acceptTerms) return { ok: false, error: "termsRequired" };

  const supabase = await createClient();
  const { error } = await supabase.rpc("complete_onboarding", {
    p_username: v.username,
    p_birth_date: v.birthDate ?? null,
    p_accept_terms: v.acceptTerms ?? false,
    p_intents: v.intents,
    p_budget_range: v.budgetRange,
    p_work_preference: v.workPreference,
    p_team_mode: v.teamMode,
    p_weekly_time: v.weeklyTime,
    p_categories: v.categories,
    p_skills: v.skills,
  });
  if (error) {
    const key = dbErrorKey(error.message);
    return { ok: false, error: key, fields: key === "usernameTaken" ? { username: "usernameTaken" } : undefined };
  }

  updateTag(`profile:${v.username}`);
  const locale = await getLocale();
  return redirect({ href: "/dashboard?welcome=1", locale });
}

export async function updateProfile(input: ProfileInput): Promise<ActionResult> {
  const parsed = profileSchema.safeParse(input);
  if (!parsed.success) return fieldErrors(parsed.error);
  const v = parsed.data;

  const account = await getAccount();
  if (!account) return { ok: false, error: "sessionExpired" };

  const supabase = await createClient();
  const { error } = await supabase
    .from("profiles")
    .update({
      username: v.username,
      bio: v.bio,
      experience: v.experience,
      country: v.country,
      city: v.city,
      availability_hours: v.availabilityHours,
      looking_for: v.lookingFor,
    })
    .eq("id", account.id);
  if (error) {
    const key = dbErrorKey(error.message);
    return { ok: false, error: key, fields: key === "usernameTaken" ? { username: "usernameTaken" } : undefined };
  }

  const [skills, links] = await Promise.all([
    supabase.rpc("set_my_skills", { p_skills: v.skills }),
    supabase.rpc("set_my_links", {
      p_links: v.links,
      p_portfolio: v.portfolio.map((p) => ({ title: p.title, url: p.url })),
    }),
  ]);
  if (skills.error || links.error) return { ok: false, error: dbErrorKey(skills.error?.message ?? links.error?.message) };

  if (account.username) updateTag(`profile:${account.username}`);
  updateTag(`profile:${v.username}`);
  return { ok: true };
}

export async function updatePreferences(input: Omit<PreferencesInput, "skills">): Promise<ActionResult> {
  const parsed = preferencesOnlySchema.safeParse(input);
  if (!parsed.success) return fieldErrors(parsed.error);
  const v = parsed.data;

  const account = await getAccount();
  if (!account) return { ok: false, error: "sessionExpired" };

  const supabase = await createClient();
  const [answers, profile] = await Promise.all([
    supabase.from("onboarding_answers").upsert({
      profile_id: account.id,
      budget_range: v.budgetRange,
      work_preference: v.workPreference,
      team_mode: v.teamMode,
      weekly_time: v.weeklyTime,
      categories: v.categories,
    }),
    supabase.from("profiles").update({ intents: v.intents }).eq("id", account.id),
  ]);
  if (answers.error || profile.error) return { ok: false, error: dbErrorKey(answers.error?.message ?? profile.error?.message) };
  return { ok: true };
}

/**
 * Soft-deletes the account (hidden immediately, purged after 30 days).
 * Password accounts confirm with their password, others type their email.
 */
export async function deleteAccount(input: DeleteAccountInput): Promise<ActionResult> {
  const parsed = deleteAccountSchema.safeParse(input);
  if (!parsed.success) return fieldErrors(parsed.error);

  const account = await getAccount();
  if (!account) return { ok: false, error: "sessionExpired" };

  const supabase = await createClient();
  if (account.hasPassword) {
    const { error } = await supabase.auth.signInWithPassword({
      email: account.email,
      password: parsed.data.confirmation,
      options: { captchaToken: parsed.data.captchaToken },
    });
    if (error) {
      return {
        ok: false,
        error: error.code === "captcha_failed" ? "captchaFailed" : "confirmationMismatch",
        fields: { confirmation: "confirmationMismatch" },
      };
    }
  } else if (parsed.data.confirmation.toLowerCase() !== account.email.toLowerCase()) {
    return { ok: false, error: "confirmationMismatch", fields: { confirmation: "confirmationMismatch" } };
  }

  const { error } = await supabase.rpc("request_account_deletion");
  if (error) return { ok: false, error: dbErrorKey(error.message) };

  if (account.username) updateTag(`profile:${account.username}`);
  await supabase.auth.signOut({ scope: "global" });

  const locale = await getLocale();
  return redirect({ href: "/login?deleted=1", locale });
}

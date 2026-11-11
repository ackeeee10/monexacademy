import "server-only";

import { getLocale } from "next-intl/server";
import { cache } from "react";

import { redirect } from "@/i18n/navigation";
import { isSupabaseConfigured } from "@/lib/env";
import { createClient } from "@/lib/supabase/server";
import type { INTENTS, LOOKING_FOR } from "@/lib/validation/profile";

export type Account = {
  id: string;
  email: string;
  username: string | null;
  avatarUrl: string | null;
  bio: string | null;
  experience: string | null;
  country: string | null;
  city: string | null;
  availabilityHours: number | null;
  lookingFor: (typeof LOOKING_FOR)[number][];
  intents: (typeof INTENTS)[number][];
  role: "user" | "moderator" | "admin";
  plan: "free" | "pro" | "elite";
  isBlocked: boolean;
  deletedAt: string | null;
  onboardingCompleted: boolean;
  hasBirthDate: boolean;
  hasAcceptedTerms: boolean;
  hasPassword: boolean;
};

type RawAccount = Record<string, unknown>;

function toAccount(raw: RawAccount): Account {
  const str = (v: unknown) => (typeof v === "string" ? v : null);
  return {
    id: String(raw.id),
    email: str(raw.email) ?? "",
    username: str(raw.username),
    avatarUrl: str(raw.avatar_url),
    bio: str(raw.bio),
    experience: str(raw.experience),
    country: str(raw.country),
    city: str(raw.city),
    availabilityHours: typeof raw.availability_hours === "number" ? raw.availability_hours : null,
    lookingFor: Array.isArray(raw.looking_for) ? (raw.looking_for as Account["lookingFor"]) : [],
    intents: Array.isArray(raw.intents) ? (raw.intents as Account["intents"]) : [],
    role: (str(raw.role) as Account["role"]) ?? "user",
    plan: (str(raw.plan) as Account["plan"]) ?? "free",
    isBlocked: raw.is_blocked === true,
    deletedAt: str(raw.deleted_at),
    onboardingCompleted: raw.onboarding_completed === true,
    hasBirthDate: raw.birth_date != null,
    hasAcceptedTerms: raw.terms_accepted_at != null,
    hasPassword: raw.has_password === true,
  };
}

/** Verified user id from the session JWT, or null. Deduplicated per request. */
export const getUserId = cache(async (): Promise<string | null> => {
  if (!isSupabaseConfigured()) return null;
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const sub = data?.claims?.sub;
  return typeof sub === "string" ? sub : null;
});

/** The signed-in user's full account (public + private fields), or null. */
export const getAccount = cache(async (): Promise<Account | null> => {
  const userId = await getUserId();
  if (!userId) return null;
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("get_my_account");
  if (error || !data) return null;
  return toAccount(data as RawAccount);
});

/** True when the user has 2FA set up but this session hasn't passed it yet. */
export const needsMfa = cache(async (): Promise<boolean> => {
  const supabase = await createClient();
  const { data } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
  return data?.nextLevel === "aal2" && data.currentLevel !== "aal2";
});

type RequireOptions = {
  /** Path to come back to after signing in. */
  next?: string;
  /** Allow accounts that haven't finished onboarding (the onboarding page itself). */
  allowIncompleteOnboarding?: boolean;
};

/**
 * Guard for signed-in pages: redirects to login, 2FA verification or
 * onboarding as needed, then returns the account.
 */
export async function requireAccount({ next, allowIncompleteOnboarding = false }: RequireOptions = {}): Promise<Account> {
  const locale = await getLocale();
  const account = await getAccount();

  if (!account) {
    const href = next ? `/login?next=${encodeURIComponent(next)}` : "/login";
    return redirect({ href, locale });
  }
  if (await needsMfa()) {
    return redirect({ href: `/verify-2fa?next=${encodeURIComponent(next ?? "/dashboard")}`, locale });
  }
  if (account.deletedAt) {
    return redirect({ href: "/login?deleted=1", locale });
  }
  if (!account.onboardingCompleted && !allowIncompleteOnboarding) {
    return redirect({ href: "/onboarding", locale });
  }
  return account;
}

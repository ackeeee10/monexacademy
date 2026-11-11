import "server-only";

import { cacheLife, cacheTag } from "next/cache";

import { getUserId } from "@/lib/auth/account";
import { isSupabaseConfigured } from "@/lib/env";
import { createPublicClient } from "@/lib/supabase/public";
import { createClient } from "@/lib/supabase/server";
import type { BUDGETS, INTENTS, LOOKING_FOR, TEAM_MODES, WEEKLY_TIMES, WORK_PREFERENCES } from "@/lib/validation/profile";

export type Option = { id: string; name: string };

// -----------------------------------------------------------------------------
// Public reference data (cached for everyone)
// -----------------------------------------------------------------------------

export async function getCategories(): Promise<Option[]> {
  "use cache";
  cacheLife("hours");
  cacheTag("categories");
  if (!isSupabaseConfigured()) return [];
  const { data } = await createPublicClient().from("categories").select("id, name").order("sort_order");
  return (data ?? []) as Option[];
}

export async function getSkills(): Promise<Option[]> {
  "use cache";
  cacheLife("hours");
  cacheTag("skills");
  if (!isSupabaseConfigured()) return [];
  const { data } = await createPublicClient().from("skills").select("id, name").order("name");
  return (data ?? []) as Option[];
}

// -----------------------------------------------------------------------------
// Public profile
// -----------------------------------------------------------------------------

export type PublicProfile = {
  id: string;
  username: string;
  avatarUrl: string | null;
  bio: string | null;
  experience: string | null;
  country: string | null;
  city: string | null;
  availabilityHours: number | null;
  lookingFor: (typeof LOOKING_FOR)[number][];
  plan: "free" | "pro" | "elite";
  createdAt: string;
  skills: string[];
  links: { label: string; url: string }[];
  portfolio: { title: string; url: string | null; imageUrl: string | null }[];
};

export async function getPublicProfile(username: string): Promise<PublicProfile | null> {
  "use cache";
  cacheLife("hours");
  cacheTag(`profile:${username}`);
  if (!isSupabaseConfigured()) return null;

  const supabase = createPublicClient();
  const { data: p } = await supabase
    .from("profiles")
    .select("id, username, avatar_url, bio, experience, country, city, availability_hours, looking_for, plan, created_at")
    .eq("username", username)
    .maybeSingle();
  if (!p) return null;

  const [skills, links, portfolio] = await Promise.all([
    supabase.from("profile_skills").select("skills(name)").eq("profile_id", p.id),
    supabase.from("profile_links").select("label, url").eq("profile_id", p.id).order("position"),
    supabase.from("portfolio_items").select("title, url, image_url").eq("profile_id", p.id).order("position"),
  ]);

  const skillNames = ((skills.data ?? []) as { skills: { name: string } | { name: string }[] | null }[])
    .flatMap((row) => (Array.isArray(row.skills) ? row.skills : row.skills ? [row.skills] : []))
    .map((s) => s.name)
    .sort((a, b) => a.localeCompare(b));

  return {
    id: p.id,
    username: p.username,
    avatarUrl: p.avatar_url,
    bio: p.bio,
    experience: p.experience,
    country: p.country,
    city: p.city,
    availabilityHours: p.availability_hours,
    lookingFor: p.looking_for ?? [],
    plan: p.plan,
    createdAt: p.created_at,
    skills: skillNames,
    links: (links.data ?? []) as PublicProfile["links"],
    portfolio: ((portfolio.data ?? []) as { title: string; url: string | null; image_url: string | null }[]).map(
      (item) => ({ title: item.title, url: item.url, imageUrl: item.image_url }),
    ),
  };
}

// -----------------------------------------------------------------------------
// Signed-in user's own data (never cached across users)
// -----------------------------------------------------------------------------

export type MyPreferences = {
  intents: (typeof INTENTS)[number][];
  budgetRange: (typeof BUDGETS)[number] | null;
  workPreference: (typeof WORK_PREFERENCES)[number] | null;
  teamMode: (typeof TEAM_MODES)[number] | null;
  weeklyTime: (typeof WEEKLY_TIMES)[number] | null;
  categories: string[];
};

export async function getMyPreferences(): Promise<MyPreferences | null> {
  const userId = await getUserId();
  if (!userId) return null;
  const supabase = await createClient();
  const [{ data: answers }, { data: profile }] = await Promise.all([
    supabase
      .from("onboarding_answers")
      .select("budget_range, work_preference, team_mode, weekly_time, categories")
      .eq("profile_id", userId)
      .maybeSingle(),
    supabase.rpc("get_my_account"),
  ]);
  const intents = Array.isArray((profile as { intents?: unknown } | null)?.intents)
    ? ((profile as { intents: MyPreferences["intents"] }).intents)
    : [];
  return {
    intents,
    budgetRange: answers?.budget_range ?? null,
    workPreference: answers?.work_preference ?? null,
    teamMode: answers?.team_mode ?? null,
    weeklyTime: answers?.weekly_time ?? null,
    categories: answers?.categories ?? [],
  };
}

export type MyProfileExtras = {
  skillIds: string[];
  links: { label: string; url: string }[];
  portfolio: { title: string; url: string }[];
};

export async function getMyProfileExtras(): Promise<MyProfileExtras> {
  const userId = await getUserId();
  if (!userId) return { skillIds: [], links: [], portfolio: [] };
  const supabase = await createClient();
  const [skills, links, portfolio] = await Promise.all([
    supabase.from("profile_skills").select("skill_id").eq("profile_id", userId),
    supabase.from("profile_links").select("label, url").eq("profile_id", userId).order("position"),
    supabase.from("portfolio_items").select("title, url").eq("profile_id", userId).order("position"),
  ]);
  return {
    skillIds: ((skills.data ?? []) as { skill_id: string }[]).map((s) => s.skill_id),
    links: (links.data ?? []) as MyProfileExtras["links"],
    portfolio: ((portfolio.data ?? []) as { title: string; url: string | null }[]).map((p) => ({
      title: p.title,
      url: p.url ?? "",
    })),
  };
}

export async function hasVerifiedMfa(): Promise<boolean> {
  const supabase = await createClient();
  const { data } = await supabase.auth.mfa.listFactors();
  return Boolean(data?.totp.some((f) => f.status === "verified"));
}

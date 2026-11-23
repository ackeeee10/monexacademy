import "server-only";

import { cacheLife, cacheTag } from "next/cache";

import { isSupabaseConfigured } from "@/lib/env";
import { createPublicClient } from "@/lib/supabase/public";
import { createClient } from "@/lib/supabase/server";
import type { BUDGETS, TEAM_MODES, WORK_PREFERENCES } from "@/lib/validation/profile";
import type { DIFFICULTIES, IdeaFilters, TIME_TO_INCOME } from "@/lib/validation/idea";

export const IDEAS_PAGE_SIZE = 12;

export type Budget = (typeof BUDGETS)[number];
export type WorkMode = (typeof WORK_PREFERENCES)[number];
export type TeamMode = (typeof TEAM_MODES)[number];
export type Difficulty = (typeof DIFFICULTIES)[number];
export type TimeToIncome = (typeof TIME_TO_INCOME)[number];
export type IdeaStatus = "draft" | "pending" | "approved" | "rejected" | "changes_requested" | "hidden";

/** Public fields of an idea (what everyone may see). */
export type IdeaSummary = {
  id: string;
  slug: string;
  title: string;
  shortDescription: string;
  categoryId: string;
  categoryName: string;
  categorySlug: string;
  investmentRange: Budget;
  earningMin: number;
  earningMax: number;
  difficulty: Difficulty;
  timeToFirstIncome: TimeToIncome;
  workMode: WorkMode;
  teamMode: TeamMode;
  lookingForRoles: string[];
  isOriginal: boolean;
  isFeatured: boolean;
  featuredUntil: string | null;
  savesCount: number;
  publishedAt: string | null;
  createdAt: string;
  status: IdeaStatus;
  authorUsername: string | null;
  authorPlan: "free" | "pro" | "elite" | null;
  skills: string[];
};

/** Locked content, returned only to the author, admins and (later) unlockers. */
export type IdeaLockedContent = {
  launchPlan: string[];
  marketAnalysis: string | null;
  risks: string | null;
  checklist: string[];
  moderationNote: string | null;
  isAuthor: boolean;
};

const SUMMARY_SELECT = [
  "id", "slug", "title", "short_description", "category_id", "investment_range", "earning_min", "earning_max",
  "difficulty", "time_to_first_income", "work_mode", "team_mode", "looking_for_roles", "source",
  "status", "is_featured_until", "saves_count", "published_at", "created_at",
  // Inner join, so the category filter can run on the server.
  "category:categories!inner(name, slug)",
  "author:profiles!author_id(username, plan)",
  "idea_skills(skill:skills(name))",
].join(", ");

type Row = Record<string, unknown>;

function toSummary(row: Row): IdeaSummary {
  const category = row.category as { name: string; slug: string };
  const author = row.author as { username: string | null; plan: IdeaSummary["authorPlan"] } | null;
  const skillRows = (row.idea_skills as { skill: { name: string } | null }[] | null) ?? [];
  const featuredUntil = row.is_featured_until as string | null;
  return {
    id: row.id as string,
    slug: row.slug as string,
    title: row.title as string,
    shortDescription: row.short_description as string,
    categoryId: row.category_id as string,
    categoryName: category.name,
    categorySlug: category.slug,
    investmentRange: row.investment_range as Budget,
    earningMin: row.earning_min as number,
    earningMax: row.earning_max as number,
    difficulty: row.difficulty as Difficulty,
    timeToFirstIncome: row.time_to_first_income as TimeToIncome,
    workMode: row.work_mode as WorkMode,
    teamMode: row.team_mode as TeamMode,
    lookingForRoles: (row.looking_for_roles as string[] | null) ?? [],
    isOriginal: row.source === "monex",
    isFeatured: featuredUntil !== null && new Date(featuredUntil) > new Date(),
    featuredUntil,
    savesCount: row.saves_count as number,
    publishedAt: row.published_at as string | null,
    createdAt: row.created_at as string,
    status: row.status as IdeaStatus,
    authorUsername: author?.username ?? null,
    authorPlan: author?.plan ?? null,
    skills: skillRows.map((s) => s.skill?.name).filter((n): n is string => Boolean(n)),
  };
}

export type IdeaPage = { items: IdeaSummary[]; total: number; page: number; pageCount: number };

const MIN_EARNING: Record<NonNullable<IdeaFilters["minEarning"]>, number> = {
  "500": 500,
  "1000": 1000,
  "3000": 3000,
};

export type CategoryOption = { slug: string; name: string };

/** Categories for the filter bar and the form (public reference data, cached). */
export async function getIdeaCategories(): Promise<CategoryOption[]> {
  "use cache";
  cacheLife("hours");
  cacheTag("categories");
  if (!isSupabaseConfigured()) return [];
  const { data } = await createPublicClient().from("categories").select("slug, name").order("sort_order");
  return (data ?? []) as CategoryOption[];
}

/** Browse approved ideas. Uses the anonymous client, so only public ideas can appear. */
export async function searchIdeas(filters: IdeaFilters): Promise<IdeaPage> {
  const empty: IdeaPage = { items: [], total: 0, page: 1, pageCount: 1 };
  if (!isSupabaseConfigured()) return empty;

  const page = filters.page ?? 1;
  const from = (page - 1) * IDEAS_PAGE_SIZE;
  const to = from + IDEAS_PAGE_SIZE - 1;

  let query = createPublicClient()
    .from("ideas")
    .select(SUMMARY_SELECT, { count: "exact" })
    .eq("status", "approved");

  if (filters.q) query = query.textSearch("search_tsv", filters.q, { type: "websearch", config: "english" });
  if (filters.category) query = query.eq("category.slug", filters.category);
  if (filters.budget) query = query.lte("investment_range", filters.budget);
  if (filters.difficulty) query = query.eq("difficulty", filters.difficulty);
  if (filters.time) query = query.eq("time_to_first_income", filters.time);
  if (filters.mode) query = query.eq("work_mode", filters.mode);
  if (filters.team) query = query.eq("team_mode", filters.team);
  if (filters.minEarning) query = query.gte("earning_max", MIN_EARNING[filters.minEarning]);

  switch (filters.sort) {
    case "earning":
      query = query.order("earning_max", { ascending: false });
      break;
    case "lowest_investment":
      query = query.order("investment_range", { ascending: true });
      break;
    case "most_saved":
      query = query.order("saves_count", { ascending: false });
      break;
    default:
      break;
  }
  query = query.order("published_at", { ascending: false, nullsFirst: false }).range(from, to);

  const { data, count, error } = await query;
  if (error) {
    console.error("[ideas] search failed", error.message);
    return empty;
  }
  const total = count ?? 0;
  return {
    items: ((data ?? []) as unknown as Row[]).map(toSummary),
    total,
    page,
    pageCount: Math.max(1, Math.ceil(total / IDEAS_PAGE_SIZE)),
  };
}

/** Currently featured approved ideas (newest feature first). */
export async function getFeaturedIdeas(limit = 3): Promise<IdeaSummary[]> {
  if (!isSupabaseConfigured()) return [];
  const { data, error } = await createPublicClient()
    .from("ideas")
    .select(SUMMARY_SELECT)
    .eq("status", "approved")
    .gt("is_featured_until", new Date().toISOString())
    .order("is_featured_until", { ascending: false })
    .limit(limit);
  if (error) {
    console.error("[ideas] featured failed", error.message);
    return [];
  }
  return ((data ?? []) as unknown as Row[]).map(toSummary);
}

/** One idea by id, using the caller's session (authors can see their own drafts). */
export async function getIdeaById(id: string): Promise<IdeaSummary | null> {
  if (!isSupabaseConfigured()) return null;
  const { data, error } = await (await createClient())
    .from("ideas")
    .select(SUMMARY_SELECT)
    .eq("id", id)
    .maybeSingle();
  if (error) {
    console.error("[ideas] load by id failed", error.message);
    return null;
  }
  return data ? toSummary(data as unknown as Row) : null;
}

/** One idea by slug, using the caller's session so authors can see their own drafts. */
export async function getIdeaBySlug(slug: string): Promise<IdeaSummary | null> {
  if (!isSupabaseConfigured()) return null;
  const { data, error } = await (await createClient())
    .from("ideas")
    .select(SUMMARY_SELECT)
    .eq("slug", slug)
    .maybeSingle();
  if (error) {
    console.error("[ideas] detail failed", error.message);
    return null;
  }
  return data ? toSummary(data as unknown as Row) : null;
}

/** Locked content. The database returns it only to the author, admins and unlockers. */
export async function getIdeaLockedContent(ideaId: string): Promise<IdeaLockedContent | null> {
  if (!isSupabaseConfigured()) return null;
  const { data, error } = await (await createClient()).rpc("get_idea_full", { p_idea_id: ideaId });
  if (error) {
    console.error("[ideas] locked content failed", error.message);
    return null;
  }
  if (!data || typeof data !== "object") return null;
  const d = data as Record<string, unknown>;
  return {
    launchPlan: (d.launch_plan as string[] | null) ?? [],
    marketAnalysis: (d.market_analysis as string | null) ?? null,
    risks: (d.risks as string | null) ?? null,
    checklist: (d.checklist as string[] | null) ?? [],
    moderationNote: (d.moderation_note as string | null) ?? null,
    isAuthor: d.is_author === true,
  };
}

/** Whether the signed-in user has saved this idea. Always false for guests. */
export async function isIdeaSaved(ideaId: string): Promise<boolean> {
  if (!isSupabaseConfigured()) return false;
  const { data } = await (await createClient())
    .from("saved_ideas")
    .select("idea_id")
    .eq("idea_id", ideaId)
    .maybeSingle();
  return data !== null;
}

/** Skill ids of an idea, for pre-filling the edit form. */
export async function getIdeaSkillIds(ideaId: string): Promise<string[]> {
  if (!isSupabaseConfigured()) return [];
  const { data } = await (await createClient())
    .from("idea_skills")
    .select("skill_id")
    .eq("idea_id", ideaId);
  return (data ?? []).map((r) => (r as { skill_id: string }).skill_id);
}

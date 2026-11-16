import "server-only";

import { createClient } from "@/lib/supabase/server";
import type { IdeaStatus } from "@/lib/ideas/queries";

export const ADMIN_PAGE_SIZE = 25;

export type ReportStatus = "open" | "resolved" | "dismissed";
export type ReportReason = "spam" | "scam" | "prohibited" | "inappropriate" | "copyright" | "suspected_minor" | "other";
export type UserFilter = "all" | "blocked" | "age_check" | "deleted" | "trusted" | "staff";

export type Paged<T> = { total: number; items: T[] };

export type AdminOverview = {
  pendingIdeas: number;
  openReports: number;
  approvedIdeas: number;
  users: number;
  newUsers7d: number;
  blockedUsers: number;
  ageChecks: number;
};

export type AdminIdeaRow = {
  id: string;
  slug: string;
  title: string;
  shortDescription: string;
  status: IdeaStatus;
  source: "user" | "monex" | "ai";
  category: string;
  authorId: string | null;
  authorUsername: string | null;
  authorTrust: "new" | "trusted" | null;
  moderationNote: string | null;
  createdAt: string;
  updatedAt: string;
  openReports: number;
};

export type AdminReportRow = {
  id: string;
  targetType: "idea" | "profile";
  targetId: string;
  reason: ReportReason;
  details: string | null;
  status: ReportStatus;
  createdAt: string;
  resolvedAt: string | null;
  resolutionNote: string | null;
  reporterUsername: string | null;
  resolverUsername: string | null;
  target: {
    title?: string;
    slug?: string;
    status?: IdeaStatus;
    username?: string | null;
    isBlocked?: boolean;
    ownerId: string | null;
    ownerUsername: string | null;
  } | null;
};

export type AdminUserRow = {
  id: string;
  username: string | null;
  email: string;
  role: "user" | "moderator" | "admin";
  trustLevel: "new" | "trusted";
  plan: "free" | "pro" | "elite";
  isBlocked: boolean;
  ageCheckRequired: boolean;
  deletedAt: string | null;
  onboardingCompleted: boolean;
  createdAt: string;
};

export type AdminUserDetail = AdminUserRow & {
  trustManual: boolean;
  country: string | null;
  ideas: { id: string; slug: string; title: string; status: IdeaStatus; updatedAt: string }[];
  reportsAgainst: number;
  openReportsAgainst: number;
  history: { action: string; createdAt: string; details: Record<string, unknown>; actorUsername: string | null }[];
};

export type AdminTaxonomy = {
  categories: { id: string; name: string; slug: string; sortOrder: number; ideas: number }[];
  skills: { id: string; name: string; slug: string; ideas: number; profiles: number }[];
};

export type AuditEntry = {
  id: string;
  action: string;
  targetType: string;
  targetId: string | null;
  details: Record<string, unknown>;
  createdAt: string;
  actorUsername: string | null;
};

/** snake_case keys from Postgres JSON -> camelCase. `details` payloads are left as stored. */
function camelize(value: unknown, key?: string): unknown {
  if (key === "details") return value;
  if (Array.isArray(value)) return value.map((v) => camelize(v));
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([k, v]) => [
        k.replace(/_([a-z0-9])/g, (_, ch: string) => ch.toUpperCase()),
        camelize(v, k),
      ]),
    );
  }
  return value;
}

async function rpc<T>(fn: string, args: Record<string, unknown> = {}): Promise<T | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc(fn, args);
  if (error) {
    console.error(`[admin] ${fn}`, error.message);
    return null;
  }
  return camelize(data) as T;
}

const offset = (page: number) => (Math.max(1, page) - 1) * ADMIN_PAGE_SIZE;
const emptyPage = <T>(): Paged<T> => ({ total: 0, items: [] });

export const getAdminOverview = () => rpc<AdminOverview>("admin_overview");

export async function listAdminIdeas(status: IdeaStatus, search: string | undefined, page: number) {
  return (
    (await rpc<Paged<AdminIdeaRow>>("admin_list_ideas", {
      p_status: status,
      p_search: search ?? null,
      p_limit: ADMIN_PAGE_SIZE,
      p_offset: offset(page),
    })) ?? emptyPage<AdminIdeaRow>()
  );
}

export async function listAdminReports(status: ReportStatus, page: number) {
  return (
    (await rpc<Paged<AdminReportRow>>("admin_list_reports", {
      p_status: status,
      p_limit: ADMIN_PAGE_SIZE,
      p_offset: offset(page),
    })) ?? emptyPage<AdminReportRow>()
  );
}

export async function listAdminUsers(search: string | undefined, filter: UserFilter, page: number) {
  return (
    (await rpc<Paged<AdminUserRow>>("admin_list_users", {
      p_search: search ?? null,
      p_filter: filter,
      p_limit: ADMIN_PAGE_SIZE,
      p_offset: offset(page),
    })) ?? emptyPage<AdminUserRow>()
  );
}

export const getAdminUser = (id: string) => rpc<AdminUserDetail>("admin_get_user", { p_user: id });

export const getAdminTaxonomy = () => rpc<AdminTaxonomy>("admin_list_taxonomy");

export async function listAudit(page: number) {
  return (
    (await rpc<Paged<AuditEntry>>("admin_list_audit", { p_limit: ADMIN_PAGE_SIZE, p_offset: offset(page) })) ??
    emptyPage<AuditEntry>()
  );
}

export type AdminUserCredits = {
  balances: { subscription: number; purchased: number; earned: number };
  total: number;
  transactions: { delta: number; bucket: string; reason: string; note: string | null; balanceAfter: number; createdAt: string }[];
};

export const getAdminUserCredits = (id: string) => rpc<AdminUserCredits>("admin_get_user_credits", { p_user: id });

export type AdminCreditStats = {
  byReason: { reason: string; granted: number; spent: number; count: number }[];
  inCirculation: { subscription: number; purchased: number; earned: number };
  unlocks: number;
  featured: number;
};

export const getAdminCreditStats = (days = 30) => rpc<AdminCreditStats>("admin_credit_stats", { p_days: days });

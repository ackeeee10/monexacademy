import "server-only";

import { cacheLife, cacheTag } from "next/cache";

import { isSupabaseConfigured } from "@/lib/env";
import { createPublicClient } from "@/lib/supabase/public";
import { createClient } from "@/lib/supabase/server";

export const WALLET_PAGE_SIZE = 20;

export type CreditBuckets = { subscription: number; purchased: number; earned: number };

export type CreditReason =
  | "signup_bonus" | "subscription_grant" | "trial_grant" | "purchase" | "unlock_idea" | "first_message"
  | "job_apply" | "extra_post" | "feature_post" | "lesson_purchase" | "creator_earning" | "admin_adjustment"
  | "refund" | "expiry";

export type CreditTransaction = {
  id: string;
  delta: number;
  bucket: keyof CreditBuckets;
  reason: CreditReason;
  relatedType: string | null;
  relatedId: string | null;
  relatedTitle: string | null;
  relatedSlug: string | null;
  note: string | null;
  balanceAfter: number;
  createdAt: string;
};

export type Wallet = {
  plan: "free" | "pro" | "elite";
  balances: CreditBuckets;
  total: number;
  prices: Record<string, number>;
  posts: { freePosts: number | null; reset: "never" | "monthly"; used: number; nextCost: number };
  featured: { quota: number; nextCost: number };
  transactionsTotal: number;
  transactions: CreditTransaction[];
};

type Raw = Record<string, unknown>;

function toTransaction(r: Raw): CreditTransaction {
  return {
    id: String(r.id),
    delta: Number(r.delta),
    bucket: r.bucket as CreditTransaction["bucket"],
    reason: r.reason as CreditReason,
    relatedType: (r.related_type as string | null) ?? null,
    relatedId: (r.related_id as string | null) ?? null,
    relatedTitle: (r.related_title as string | null) ?? null,
    relatedSlug: (r.related_slug as string | null) ?? null,
    note: (r.note as string | null) ?? null,
    balanceAfter: Number(r.balance_after),
    createdAt: String(r.created_at),
  };
}

/** The signed-in user's wallet with one page of history. Null when it can't be loaded. */
export async function getWallet(page = 1): Promise<Wallet | null> {
  if (!isSupabaseConfigured()) return null;
  const { data, error } = await (await createClient()).rpc("get_my_wallet", {
    p_limit: WALLET_PAGE_SIZE,
    p_offset: (Math.max(1, page) - 1) * WALLET_PAGE_SIZE,
  });
  if (error || !data) {
    if (error) console.error("[wallet]", error.message);
    return null;
  }
  const d = data as Raw;
  const posts = d.posts as Raw;
  const featured = d.featured as Raw;
  return {
    plan: d.plan as Wallet["plan"],
    balances: d.balances as CreditBuckets,
    total: Number(d.total),
    prices: d.prices as Record<string, number>,
    posts: {
      freePosts: posts.free_posts === null ? null : Number(posts.free_posts),
      reset: posts.reset as "never" | "monthly",
      used: Number(posts.used),
      nextCost: Number(posts.next_cost),
    },
    featured: { quota: Number(featured.quota), nextCost: Number(featured.next_cost) },
    transactionsTotal: Number(d.transactions_total),
    transactions: ((d.transactions as Raw[]) ?? []).map(toTransaction),
  };
}

/** Public credit prices (for the pricing page and unlock buttons). */
export async function getCreditPrices(): Promise<Record<string, number>> {
  "use cache";
  cacheLife("hours");
  cacheTag("credit-prices");
  if (!isSupabaseConfigured()) return {};
  const { data } = await createPublicClient().from("credit_prices").select("action, credits");
  return Object.fromEntries((data ?? []).map((r) => [r.action as string, r.credits as number]));
}

/** Whether the signed-in user has unlocked this idea. */
export async function isIdeaUnlocked(ideaId: string): Promise<boolean> {
  if (!isSupabaseConfigured()) return false;
  const { data } = await (await createClient())
    .from("idea_unlocks")
    .select("idea_id")
    .eq("idea_id", ideaId)
    .maybeSingle();
  return data !== null;
}

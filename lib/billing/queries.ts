import "server-only";

import { isSupabaseConfigured } from "@/lib/env";
import { createClient } from "@/lib/supabase/server";

export type BillingSummary = {
  plan: "free" | "pro" | "elite";
  trialUsed: boolean;
  hasCustomer: boolean;
  subscription: {
    plan: "pro" | "elite";
    interval: "month" | "year";
    status: string;
    trialEnd: string | null;
    currentPeriodEnd: string | null;
    cancelAtPeriodEnd: boolean;
  } | null;
};

type Raw = Record<string, unknown>;

/** The signed-in user's plan, trial status and live subscription. */
export async function getBilling(): Promise<BillingSummary | null> {
  if (!isSupabaseConfigured()) return null;
  const { data, error } = await (await createClient()).rpc("get_my_billing");
  if (error || !data) {
    if (error) console.error("[billing]", error.message);
    return null;
  }
  const d = data as Raw;
  const s = d.subscription as Raw | null;
  return {
    plan: d.plan as BillingSummary["plan"],
    trialUsed: Boolean(d.trial_used),
    hasCustomer: Boolean(d.has_customer),
    subscription: s
      ? {
          plan: s.plan as "pro" | "elite",
          interval: s.interval as "month" | "year",
          status: String(s.status),
          trialEnd: (s.trial_end as string | null) ?? null,
          currentPeriodEnd: (s.current_period_end as string | null) ?? null,
          cancelAtPeriodEnd: Boolean(s.cancel_at_period_end),
        }
      : null,
  };
}

/** Tops up yearly plans' monthly credits when a month has passed. */
export async function refreshMyCredits(): Promise<void> {
  if (!isSupabaseConfigured()) return;
  const { error } = await (await createClient()).rpc("refresh_my_credits");
  if (error) console.error("[billing] refresh", error.message);
}

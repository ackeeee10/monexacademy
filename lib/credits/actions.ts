"use server";

import { z } from "zod";

import { getAccount } from "@/lib/auth/account";
import type { ActionResult, AuthErrorKey } from "@/lib/auth/types";
import { createClient } from "@/lib/supabase/server";

function dbErrorKey(message: string | undefined): AuthErrorKey {
  if (!message) return "unexpected";
  if (message.includes("not_signed_in")) return "sessionExpired";
  if (message.includes("profile_not_ready")) return "profileNotReady";
  if (message.includes("insufficient_credits")) return "insufficientCredits";
  if (message.includes("price_changed")) return "priceChanged";
  if (message.includes("idea_not_found")) return "ideaNotFound";
  console.error("[credits]", message);
  return "unexpected";
}

const input = z.object({ ideaId: z.uuid(), maxCost: z.number().int().min(0).max(100000) });

export type CreditResult = { balance: number };

/** Unlocks an idea's full plan for credits. Unlocking again is free. */
export async function unlockIdeaAction(value: z.input<typeof input>): Promise<ActionResult<CreditResult>> {
  const parsed = input.safeParse(value);
  if (!parsed.success) return { ok: false, error: "invalidInput" };
  if (!(await getAccount())) return { ok: false, error: "sessionExpired" };

  const { data, error } = await (await createClient()).rpc("unlock_idea", {
    p_idea_id: parsed.data.ideaId,
    p_max_cost: parsed.data.maxCost,
  });
  if (error || !data) return { ok: false, error: dbErrorKey(error?.message) };
  return { ok: true, data: { balance: Number((data as { balance: number }).balance) } };
}

/** Features the user's approved idea for 7 days (plan quota first, then credits). */
export async function featureIdeaAction(value: z.input<typeof input>): Promise<ActionResult<CreditResult>> {
  const parsed = input.safeParse(value);
  if (!parsed.success) return { ok: false, error: "invalidInput" };
  if (!(await getAccount())) return { ok: false, error: "sessionExpired" };

  const { data, error } = await (await createClient()).rpc("feature_idea", {
    p_idea_id: parsed.data.ideaId,
    p_max_cost: parsed.data.maxCost,
  });
  if (error || !data) return { ok: false, error: dbErrorKey(error?.message) };
  return { ok: true, data: { balance: Number((data as { balance: number }).balance) } };
}

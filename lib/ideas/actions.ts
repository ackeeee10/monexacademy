"use server";

import { getAccount } from "@/lib/auth/account";
import type { ActionResult, AuthErrorKey } from "@/lib/auth/types";
import { createClient } from "@/lib/supabase/server";
import { ideaSchema, type IdeaInput } from "@/lib/validation/idea";

export type SavedIdea = { id: string; slug: string; status: string };

/** Maps errors raised by save_idea() and the ideas tables to translation keys. */
function dbErrorKey(message: string | undefined): AuthErrorKey {
  if (!message) return "unexpected";
  if (message.includes("not_signed_in")) return "sessionExpired";
  if (message.includes("profile_not_ready")) return "profileNotReady";
  if (message.includes("idea_not_found")) return "ideaNotFound";
  if (message.includes("idea_locked")) return "ideaLocked";
  if (message.includes("ideas_earning_range")) return "earningsInvalid";
  if (message.includes("insufficient_credits")) return "insufficientCredits";
  if (message.includes("ideas_category_id_fkey") || message.includes("idea_skills_skill_id_fkey")) return "invalidInput";
  console.error("[ideas]", message);
  return "unexpected";
}

/**
 * Creates or updates an idea. Passing `id` edits an existing idea (only the
 * author may, and only before it is approved). `submit` sends it for review;
 * without it the idea stays a draft.
 */
export async function saveIdeaAction(
  id: string | null,
  input: IdeaInput,
  submit: boolean,
  /** The user agreed to pay credits for a post over the plan's free posts. */
  payExtra = false,
): Promise<ActionResult<SavedIdea>> {
  const account = await getAccount();
  if (!account) return { ok: false, error: "sessionExpired" };

  const parsed = ideaSchema.safeParse(input);
  if (!parsed.success) {
    const fields: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      const key = issue.path.join(".");
      if (key && !fields[key]) fields[key] = issue.message;
    }
    return { ok: false, error: "invalidInput", fields };
  }
  const v = parsed.data;

  const supabase = await createClient();
  const { data: ideaId, error } = await supabase.rpc("save_idea", {
    p_id: id,
    p_submit: submit,
    p_pay_extra: payExtra,
    p_data: {
      title: v.title,
      short_description: v.shortDescription,
      category_id: v.categoryId,
      investment_range: v.investmentRange,
      earning_min: v.earningMin,
      earning_max: v.earningMax,
      difficulty: v.difficulty,
      time_to_first_income: v.timeToFirstIncome,
      work_mode: v.workMode,
      team_mode: v.teamMode,
      looking_for_roles: v.lookingForRoles,
      skill_ids: v.skillIds,
      launch_plan: v.launchPlan,
      market_analysis: v.marketAnalysis ?? "",
      risks: v.risks ?? "",
    },
  });
  if (error?.message.includes("post_limit_reached")) {
    // detail = credits the extra post costs; the form asks before paying.
    return { ok: false, error: "postLimitReached", detail: error.details ?? undefined };
  }
  if (error || typeof ideaId !== "string") {
    return { ok: false, error: dbErrorKey(error?.message) };
  }

  const { data: row, error: readError } = await supabase
    .from("ideas")
    .select("id, slug, status")
    .eq("id", ideaId)
    .single();
  if (readError || !row) return { ok: false, error: "unexpected" };

  return { ok: true, data: row as SavedIdea };
}

/** Saves or removes a save on an idea. Saving needs an account. */
export async function setIdeaSavedAction(ideaId: string, save: boolean): Promise<ActionResult> {
  const account = await getAccount();
  if (!account) return { ok: false, error: "sessionExpired" };

  const supabase = await createClient();
  if (save) {
    const { error } = await supabase
      .from("saved_ideas")
      .insert({ user_id: account.id, idea_id: ideaId });
    // 23505: already saved, which is the state we wanted anyway.
    if (error && error.code !== "23505") return { ok: false, error: "unexpected" };
  } else {
    const { error } = await supabase
      .from("saved_ideas")
      .delete()
      .eq("user_id", account.id)
      .eq("idea_id", ideaId);
    if (error) return { ok: false, error: "unexpected" };
  }
  return { ok: true };
}

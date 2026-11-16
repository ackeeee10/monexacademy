"use server";

import { getAccount } from "@/lib/auth/account";
import type { ActionResult, AuthErrorKey } from "@/lib/auth/types";
import { createClient } from "@/lib/supabase/server";
import { reportSchema, type ReportInput } from "@/lib/validation/report";

function dbErrorKey(message: string | undefined): AuthErrorKey {
  if (!message) return "unexpected";
  if (message.includes("not_signed_in")) return "sessionExpired";
  if (message.includes("profile_not_ready")) return "profileNotReady";
  if (message.includes("rate_limited")) return "rateLimited";
  if (message.includes("target_not_found")) return "targetNotFound";
  if (message.includes("cannot_report_self")) return "cannotReportSelf";
  console.error("[report]", message);
  return "unexpected";
}

/** Sends a report to the moderation queue. A repeat report of the same thing is ignored. */
export async function createReportAction(input: ReportInput): Promise<ActionResult> {
  const parsed = reportSchema.safeParse(input);
  if (!parsed.success) {
    const fields: Record<string, string> = {};
    for (const issue of parsed.error.issues) fields[String(issue.path[0])] ??= issue.message;
    return { ok: false, error: "invalidInput", fields };
  }
  if (!(await getAccount())) return { ok: false, error: "sessionExpired" };

  const v = parsed.data;
  const supabase = await createClient();
  const { error } = await supabase.rpc("create_report", {
    p_target_type: v.targetType,
    p_target_id: v.targetId,
    p_reason: v.reason,
    p_details: v.details ?? null,
  });
  return error ? { ok: false, error: dbErrorKey(error.message) } : { ok: true };
}

"use server";

import { updateTag } from "next/cache";
import { z } from "zod";

import type { ActionResult, AuthErrorKey } from "@/lib/auth/types";
import { createClient } from "@/lib/supabase/server";

// Every function below is also guarded in the database (admin role + 2FA session),
// so these actions only validate input and translate errors.

const ERROR_KEYS: [string, AuthErrorKey][] = [
  ["not_admin", "notAdmin"],
  ["note_required", "noteRequired"],
  ["note_too_long", "noteTooLong"],
  ["invalid_state", "invalidState"],
  ["cannot_target_self", "cannotTargetSelf"],
  ["cannot_target_admin", "cannotTargetAdmin"],
  ["user_not_found", "userNotFound"],
  ["report_not_found", "reportNotFound"],
  ["idea_not_found", "ideaNotFound"],
  ["slug_taken", "slugTaken"],
  ["in_use", "inUse"],
  ["not_found", "notFound"],
  ["insufficient_credits", "insufficientCredits"],
  ["invalid_amount", "invalidAmount"],
];

function dbErrorKey(message: string | undefined): AuthErrorKey {
  if (!message) return "unexpected";
  for (const [needle, key] of ERROR_KEYS) if (message.includes(needle)) return key;
  if (message.includes("_check")) return "invalidInput";
  console.error("[admin action]", message);
  return "unexpected";
}

async function call(fn: string, args: Record<string, unknown>): Promise<ActionResult> {
  const supabase = await createClient();
  const { error } = await supabase.rpc(fn, args);
  return error ? { ok: false, error: dbErrorKey(error.message) } : { ok: true };
}

const id = z.uuid();
const note = z.string().trim().max(1000, "noteTooLong").optional();
const invalid: ActionResult = { ok: false, error: "invalidInput" };

// --- Moderation ---------------------------------------------------------------

const moderateSchema = z.object({
  ideaId: id,
  action: z.enum(["approve", "reject", "request_changes", "hide", "restore"]),
  note,
});

export async function moderateIdeaAction(input: z.input<typeof moderateSchema>): Promise<ActionResult> {
  const parsed = moderateSchema.safeParse(input);
  if (!parsed.success) return invalid;
  const v = parsed.data;
  return call("admin_moderate_idea", { p_idea_id: v.ideaId, p_action: v.action, p_note: v.note ?? null });
}

// --- Reports ------------------------------------------------------------------

const resolveSchema = z.object({ reportId: id, status: z.enum(["resolved", "dismissed"]), note });

export async function resolveReportAction(input: z.input<typeof resolveSchema>): Promise<ActionResult> {
  const parsed = resolveSchema.safeParse(input);
  if (!parsed.success) return invalid;
  const v = parsed.data;
  return call("admin_resolve_report", { p_report_id: v.reportId, p_status: v.status, p_note: v.note ?? null });
}

// --- Users --------------------------------------------------------------------

const userSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("block"), blocked: z.boolean(), reason: note }),
  z.object({ kind: z.literal("trust"), level: z.enum(["new", "trusted"]), reason: note }),
  z.object({ kind: z.literal("role"), role: z.enum(["user", "moderator"]) }),
  z.object({ kind: z.literal("ageCheck"), required: z.boolean(), reason: note }),
]);

export async function updateUserAction(
  userId: string,
  username: string | null,
  change: z.input<typeof userSchema>,
): Promise<ActionResult> {
  const parsedId = id.safeParse(userId);
  const parsed = userSchema.safeParse(change);
  if (!parsedId.success || !parsed.success) return invalid;
  const c = parsed.data;

  let result: ActionResult;
  switch (c.kind) {
    case "block":
      result = await call("admin_set_user_block", { p_user: userId, p_blocked: c.blocked, p_reason: c.reason ?? null });
      break;
    case "trust":
      result = await call("admin_set_user_trust", { p_user: userId, p_level: c.level, p_reason: c.reason ?? null });
      break;
    case "role":
      result = await call("admin_set_user_role", { p_user: userId, p_role: c.role });
      break;
    case "ageCheck":
      result = await call("admin_set_age_check", { p_user: userId, p_required: c.required, p_reason: c.reason ?? null });
      break;
  }
  // The public profile page is cached; refresh it when visibility may have changed.
  if (result.ok && username) updateTag(`profile:${username}`);
  return result;
}

// --- Categories and skills ----------------------------------------------------

const slug = z.string().trim().toLowerCase().regex(/^[a-z0-9-]{2,60}$/, "slugInvalid");
const name = z.string().trim().min(2, "tooShort").max(60, "tooLong");

const categorySchema = z.object({
  id: id.nullable(),
  name,
  slug,
  sortOrder: z.number().int().min(0).max(10000),
});

export async function saveCategoryAction(input: z.input<typeof categorySchema>): Promise<ActionResult> {
  const parsed = categorySchema.safeParse(input);
  if (!parsed.success) return invalid;
  const v = parsed.data;
  const result = await call("admin_save_category", {
    p_id: v.id,
    p_name: v.name,
    p_slug: v.slug,
    p_sort_order: v.sortOrder,
  });
  if (result.ok) updateTag("categories");
  return result;
}

export async function deleteCategoryAction(categoryId: string): Promise<ActionResult> {
  if (!id.safeParse(categoryId).success) return invalid;
  const result = await call("admin_delete_category", { p_id: categoryId });
  if (result.ok) updateTag("categories");
  return result;
}

const skillSchema = z.object({ id: id.nullable(), name, slug });

export async function saveSkillAction(input: z.input<typeof skillSchema>): Promise<ActionResult> {
  const parsed = skillSchema.safeParse(input);
  if (!parsed.success) return invalid;
  const v = parsed.data;
  const result = await call("admin_save_skill", { p_id: v.id, p_name: v.name, p_slug: v.slug });
  if (result.ok) updateTag("skills");
  return result;
}

export async function deleteSkillAction(skillId: string): Promise<ActionResult> {
  if (!id.safeParse(skillId).success) return invalid;
  const result = await call("admin_delete_skill", { p_id: skillId });
  if (result.ok) updateTag("skills");
  return result;
}

// --- Credits ------------------------------------------------------------------

const adjustSchema = z.object({
  userId: id,
  amount: z.number().int().min(-100000).max(100000).refine((n) => n !== 0, "invalidAmount"),
  reason: z.string().trim().min(1, "noteRequired").max(500, "noteTooLong"),
});

export async function adjustCreditsAction(input: z.input<typeof adjustSchema>): Promise<ActionResult> {
  const parsed = adjustSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: "invalidInput", fields: { [String(parsed.error.issues[0]?.path[0])]: parsed.error.issues[0]?.message ?? "" } };
  }
  const v = parsed.data;
  return call("admin_adjust_credits", { p_user: v.userId, p_amount: v.amount, p_reason: v.reason });
}

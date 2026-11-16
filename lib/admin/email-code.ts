"use server";

import { getAccount } from "@/lib/auth/account";
import type { ActionResult } from "@/lib/auth/types";
import { sendEmail } from "@/lib/email/send";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

/**
 * Emails a 6-digit admin code for the current login session. The code is made
 * in the database with the secret key and never reaches the browser.
 */
export async function sendAdminCodeAction(): Promise<ActionResult> {
  const account = await getAccount();
  if (!account) return { ok: false, error: "sessionExpired" };
  if (account.role !== "admin") return { ok: false, error: "notAdmin" };

  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  const sessionId = claims?.claims.session_id;
  if (!sessionId || claims.claims.sub !== account.id) return { ok: false, error: "sessionExpired" };

  const admin = createAdminClient();
  if (!admin) return { ok: false, error: "emailNotConfigured", detail: "SUPABASE_SECRET_KEY" };

  const { data: code, error } = await admin.rpc("issue_admin_email_code", { p_user: account.id, p_session: sessionId });
  if (error || typeof code !== "string") {
    if (error?.message.includes("rate_limited")) return { ok: false, error: "rateLimited" };
    if (error?.message.includes("not_admin")) return { ok: false, error: "notAdmin" };
    console.error("[admin code] issue failed", error?.message);
    return { ok: false, error: "unexpected" };
  }

  const sent = await sendEmail({
    to: account.email,
    subject: `${code} is your MONEX Academy admin code`,
    text: `Your admin code is ${code}. It expires in 10 minutes. If you didn't try to open the admin panel, change your password now.`,
    html: `<div style="font-family:Inter,Arial,sans-serif;color:#0B1628">
      <p>Your MONEX Academy admin code:</p>
      <p style="font-size:28px;font-weight:700;letter-spacing:6px">${code}</p>
      <p>It expires in 10 minutes. If you didn't try to open the admin panel, change your password now.</p>
    </div>`,
  });
  if (!sent.ok) {
    return {
      ok: false,
      error: sent.reason === "not_configured" ? "emailNotConfigured" : "emailNotSent",
      detail: sent.detail,
    };
  }
  return { ok: true };
}

/** Checks the emailed code; on success this login session can use the admin panel. */
export async function verifyAdminCodeAction(input: { code: string }): Promise<ActionResult> {
  const code = String(input.code ?? "").replace(/\D/g, "");
  if (code.length !== 6) return { ok: false, error: "codeInvalid" };
  if (!(await getAccount())) return { ok: false, error: "sessionExpired" };

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("verify_admin_email_code", { p_code: code });
  if (error) return { ok: false, error: error.message.includes("not_signed_in") ? "sessionExpired" : "unexpected" };
  if (data === "ok") return { ok: true };
  return { ok: false, error: data === "expired" ? "codeExpired" : "codeIncorrect" };
}

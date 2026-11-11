import type { EmailOtpType } from "@supabase/supabase-js";
import { NextResponse, type NextRequest } from "next/server";

import { safeNextPath } from "@/lib/auth/redirect";
import { createClient } from "@/lib/supabase/server";

/**
 * Landing point for links in auth emails and for Google sign-in.
 * Handles both the PKCE `code` flow and `token_hash` email links, then
 * restores accounts scheduled for deletion and applies the 2FA step.
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl;
  const next = safeNextPath(searchParams.get("next"));
  const code = searchParams.get("code");
  const tokenHash = searchParams.get("token_hash");
  const type = searchParams.get("type") as EmailOtpType | null;

  const supabase = await createClient();
  let failed = true;

  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    failed = Boolean(error);
  } else if (tokenHash && type) {
    const { error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type });
    failed = Boolean(error);
  }

  if (failed) {
    const reason = searchParams.get("error_code") === "otp_expired" || code || tokenHash ? "link_expired" : "unexpected";
    return NextResponse.redirect(new URL(`/login?error=${reason}`, origin));
  }

  await supabase.rpc("restore_my_account");

  const { data: aal } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
  const destination =
    aal?.nextLevel === "aal2" && aal.currentLevel !== "aal2" ? `/verify-2fa?next=${encodeURIComponent(next)}` : next;

  return NextResponse.redirect(new URL(destination, origin));
}

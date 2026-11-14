"use server";

import type { AuthError } from "@supabase/supabase-js";
import { getLocale } from "next-intl/server";
import type { z } from "zod";

import { redirect } from "@/i18n/navigation";
import { env } from "@/lib/env";
import { createClient } from "@/lib/supabase/server";
import {
  magicLinkSchema,
  newPasswordSchema,
  resetRequestSchema,
  signInSchema,
  signUpSchema,
  totpCodeSchema,
  type MagicLinkInput,
  type NewPasswordInput,
  type ResetRequestInput,
  type SignInInput,
  type SignUpInput,
  type TotpCodeInput,
} from "@/lib/validation/auth";

import { getRequestOrigin } from "./origin";
import { safeNextPath } from "./redirect";
import type { ActionResult, AuthErrorKey } from "./types";

// -----------------------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------------------

function fieldErrors(error: z.ZodError): ActionResult {
  const fields: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = issue.path.join(".");
    if (key && !fields[key]) fields[key] = issue.message;
  }
  return { ok: false, error: "invalidInput", fields };
}

/** Maps Supabase Auth errors to translation keys under "Errors". */
function authErrorKey(error: AuthError): AuthErrorKey {
  switch (error.code) {
    case "invalid_credentials":
      return "invalidCredentials";
    case "email_not_confirmed":
      return "emailNotConfirmed";
    case "over_email_send_rate_limit":
    case "over_request_rate_limit":
    case "over_sms_send_rate_limit":
      return "rateLimited";
    case "captcha_failed":
      return "captchaFailed";
    case "weak_password":
      return "weakPassword";
    case "same_password":
      return "samePassword";
    case "otp_expired":
      return "linkExpired";
    case "otp_disabled":
      // Magic link requested for an email without an account (shouldCreateUser: false).
      return "noAccount";
    case "mfa_verification_failed":
    case "mfa_challenge_expired":
      return "codeIncorrect";
    case "user_banned":
      return "accountBlocked";
    case "email_address_invalid":
      return "emailInvalid";
    case "signup_disabled":
    case "email_provider_disabled":
      return "signupDisabled";
    default:
      console.error("[auth]", error.code, error.message);
      return "unexpected";
  }
}

/** Failure result; captcha errors carry Supabase's reason (no secrets) for diagnosis. */
function authFailure(error: AuthError): ActionResult {
  const key = authErrorKey(error);
  return { ok: false, error: key, detail: key === "captchaFailed" ? `Supabase: ${error.message}` : undefined };
}

async function callbackUrl(next: string): Promise<string> {
  return `${await getRequestOrigin()}/api/auth/callback?next=${encodeURIComponent(next)}`;
}

/**
 * After any successful sign-in: restore an account scheduled for deletion
 * (Master Prompt 4.7) and work out where the user should land.
 */
async function postSignInDestination(next: string): Promise<string> {
  const supabase = await createClient();
  await supabase.rpc("restore_my_account");

  const { data: aal } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
  if (aal?.nextLevel === "aal2" && aal.currentLevel !== "aal2") {
    return `/verify-2fa?next=${encodeURIComponent(next)}`;
  }
  return next;
}

// -----------------------------------------------------------------------------
// Sign up / sign in
// -----------------------------------------------------------------------------

export async function signUp(input: SignUpInput): Promise<ActionResult> {
  const parsed = signUpSchema.safeParse(input);
  if (!parsed.success) return fieldErrors(parsed.error);
  const { email, password, birthDate, captchaToken } = parsed.data;

  const supabase = await createClient();
  const { error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      emailRedirectTo: await callbackUrl("/onboarding"),
      captchaToken,
      data: { birth_date: birthDate, terms_accepted: "true" },
    },
  });

  if (error) return authFailure(error);
  // Supabase doesn't reveal whether the email was already registered; neither do we.
  return { ok: true };
}

export async function signInWithPassword(input: SignInInput): Promise<ActionResult> {
  const parsed = signInSchema.safeParse(input);
  if (!parsed.success) return fieldErrors(parsed.error);
  const { email, password, captchaToken, next } = parsed.data;

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password, options: { captchaToken } });
  if (error) return authFailure(error);

  const destination = await postSignInDestination(safeNextPath(next));
  const locale = await getLocale();
  return redirect({ href: destination, locale });
}

export async function sendMagicLink(input: MagicLinkInput): Promise<ActionResult> {
  const parsed = magicLinkSchema.safeParse(input);
  if (!parsed.success) return fieldErrors(parsed.error);
  const { email, captchaToken, next } = parsed.data;

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: {
      // Log-in only: new users sign up on /signup (birth date + terms first).
      shouldCreateUser: false,
      emailRedirectTo: await callbackUrl(safeNextPath(next)),
      captchaToken,
    },
  });

  if (error) return authFailure(error);
  return { ok: true };
}

/** Asks Supabase Auth whether the Google provider is switched on. */
async function isGoogleEnabled(): Promise<boolean> {
  try {
    const res = await fetch(`${env.supabaseUrl()}/auth/v1/settings`, {
      headers: { apikey: env.supabasePublishableKey() },
      cache: "no-store",
    });
    if (!res.ok) return true; // Unknown: let Supabase decide.
    const settings = (await res.json()) as { external?: Record<string, boolean> };
    return settings.external?.google === true;
  } catch {
    return true;
  }
}

export async function signInWithGoogle(next?: string): Promise<ActionResult> {
  if (!(await isGoogleEnabled())) return { ok: false, error: "googleUnavailable" };
  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: { redirectTo: await callbackUrl(safeNextPath(next)) },
  });
  if (error || !data.url) return { ok: false, error: error ? authErrorKey(error) : "unexpected" };
  return { ok: true, redirectTo: data.url };
}

export async function signOut(): Promise<void> {
  const supabase = await createClient();
  // Only this device; "global" would also sign out the user's other devices.
  await supabase.auth.signOut({ scope: "local" });
  const locale = await getLocale();
  redirect({ href: "/", locale });
}

// -----------------------------------------------------------------------------
// Password reset
// -----------------------------------------------------------------------------

export async function requestPasswordReset(input: ResetRequestInput): Promise<ActionResult> {
  const parsed = resetRequestSchema.safeParse(input);
  if (!parsed.success) return fieldErrors(parsed.error);
  const { email, captchaToken } = parsed.data;

  const supabase = await createClient();
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: await callbackUrl("/update-password"),
    captchaToken,
  });

  // Never reveal whether an account exists; only surface rate limits and captcha problems.
  if (error) {
    const key = authErrorKey(error);
    if (key === "rateLimited" || key === "captchaFailed") return authFailure(error);
  }
  return { ok: true };
}

export async function updatePassword(input: NewPasswordInput): Promise<ActionResult> {
  const parsed = newPasswordSchema.safeParse(input);
  if (!parsed.success) return fieldErrors(parsed.error);

  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  if (!claims?.claims) return { ok: false, error: "sessionExpired" };

  const { error } = await supabase.auth.updateUser({ password: parsed.data.password });
  if (error) return { ok: false, error: authErrorKey(error) };
  return { ok: true };
}

// -----------------------------------------------------------------------------
// Two-factor authentication (TOTP)
// -----------------------------------------------------------------------------

export async function verifyMfaSignIn(input: TotpCodeInput & { next?: string }): Promise<ActionResult> {
  const parsed = totpCodeSchema.safeParse(input);
  if (!parsed.success) return fieldErrors(parsed.error);

  const supabase = await createClient();
  const { data: factors, error: listError } = await supabase.auth.mfa.listFactors();
  if (listError) return { ok: false, error: authErrorKey(listError) };

  const factor = factors.totp.find((f) => f.status === "verified");
  if (!factor) return { ok: false, error: "unexpected" };

  const { error } = await supabase.auth.mfa.challengeAndVerify({ factorId: factor.id, code: parsed.data.code });
  if (error) return { ok: false, error: authErrorKey(error) };

  const locale = await getLocale();
  return redirect({ href: safeNextPath(input.next), locale });
}

export async function startMfaEnrollment(): Promise<
  ActionResult<{ factorId: string; qrCode: string; secret: string }>
> {
  const supabase = await createClient();

  // Clean up abandoned, unverified attempts so a new one can start.
  const { data: existing } = await supabase.auth.mfa.listFactors();
  for (const factor of existing?.all ?? []) {
    if (factor.factor_type === "totp" && factor.status === "unverified") {
      await supabase.auth.mfa.unenroll({ factorId: factor.id });
    }
  }

  const { data, error } = await supabase.auth.mfa.enroll({
    factorType: "totp",
    friendlyName: `Authenticator ${new Date().toISOString().slice(0, 10)}`,
    issuer: "MONEX Academy",
  });
  if (error) return { ok: false, error: authErrorKey(error) };
  return { ok: true, data: { factorId: data.id, qrCode: data.totp.qr_code, secret: data.totp.secret } };
}

export async function confirmMfaEnrollment(input: TotpCodeInput & { factorId: string }): Promise<ActionResult> {
  const parsed = totpCodeSchema.safeParse(input);
  if (!parsed.success) return fieldErrors(parsed.error);

  const supabase = await createClient();
  const { error } = await supabase.auth.mfa.challengeAndVerify({ factorId: input.factorId, code: parsed.data.code });
  if (error) return { ok: false, error: authErrorKey(error) };
  return { ok: true };
}

export async function disableMfa(input: TotpCodeInput): Promise<ActionResult> {
  const parsed = totpCodeSchema.safeParse(input);
  if (!parsed.success) return fieldErrors(parsed.error);

  const supabase = await createClient();
  const { data: factors } = await supabase.auth.mfa.listFactors();
  const factor = factors?.totp.find((f) => f.status === "verified");
  if (!factor) return { ok: true };

  // Prove possession of the authenticator again (also raises the session to aal2).
  const verify = await supabase.auth.mfa.challengeAndVerify({ factorId: factor.id, code: parsed.data.code });
  if (verify.error) return { ok: false, error: authErrorKey(verify.error) };

  const { error } = await supabase.auth.mfa.unenroll({ factorId: factor.id });
  if (error) return { ok: false, error: authErrorKey(error) };
  return { ok: true };
}

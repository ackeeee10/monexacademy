import "server-only";

/**
 * Secret settings. Never import this from client code or from the proxy
 * (proxy.ts and lib/supabase/proxy.ts): Netlify inlines every variable the
 * proxy bundle references, and its secret scanner then blocks the deploy.
 */
export const serverEnv = {
  supabaseSecretKey: (): string | undefined => process.env.SUPABASE_SECRET_KEY || undefined,
  resendApiKey: (): string | undefined => process.env.RESEND_API_KEY || undefined,
  /** Polar organization access token. */
  polarAccessToken: (): string | undefined => process.env.POLAR_ACCESS_TOKEN || undefined,
  /** Secret that signs Polar webhooks. */
  polarWebhookSecret: (): string | undefined => process.env.POLAR_WEBHOOK_SECRET || undefined,
  /** "sandbox" (default) or "production". */
  polarServer: (): "sandbox" | "production" => (polarServerValue() === "production" ? "production" : "sandbox"),
} as const;

/** POLAR_SERVER, tolerant of case, spaces and quotes. */
export function polarServerValue(): string | null {
  const raw = process.env.POLAR_SERVER;
  if (!raw) return null;
  return raw.trim().replace(/^["']|["']$/g, "").trim().toLowerCase();
}

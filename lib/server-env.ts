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
  polarServer: (): "sandbox" | "production" => (process.env.POLAR_SERVER === "production" ? "production" : "sandbox"),
} as const;

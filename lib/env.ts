/**
 * Typed access to environment variables. Values are read lazily so the app can
 * still build without them; a missing value fails loudly only when it's used.
 * NEXT_PUBLIC_* names must be written out literally so Next.js can inline them.
 */
function required(name: string, value: string | undefined): string {
  if (!value) throw new Error(`Missing environment variable: ${name}`);
  return value;
}

export const env = {
  supabaseUrl: () => required("NEXT_PUBLIC_SUPABASE_URL", process.env.NEXT_PUBLIC_SUPABASE_URL),
  supabasePublishableKey: () =>
    required("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY),
  turnstileSiteKey: (): string | undefined => process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY || undefined,
  /** Server only. Never import from client code. */
  supabaseSecretKey: (): string | undefined => process.env.SUPABASE_SECRET_KEY || undefined,
  resendApiKey: (): string | undefined => process.env.RESEND_API_KEY || undefined,
  /** Sender address. Until a domain is verified in Resend, only onboarding@resend.dev works. */
  emailFrom: (): string => process.env.EMAIL_FROM || "MONEX Academy <onboarding@resend.dev>",
} as const;

export function isSupabaseConfigured(): boolean {
  return Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY);
}

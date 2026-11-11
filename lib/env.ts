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
} as const;

export function isSupabaseConfigured(): boolean {
  return Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY);
}

import { NextResponse } from "next/server";

/**
 * Configuration check for the owner: shows WHICH settings are present,
 * never their values.
 */
export function GET() {
  const has = (v: string | undefined) => Boolean(v && v.trim());
  return NextResponse.json(
    {
      ok: true,
      config: {
        NEXT_PUBLIC_SITE_URL: process.env.NEXT_PUBLIC_SITE_URL ?? null,
        NEXT_PUBLIC_SUPABASE_URL: has(process.env.NEXT_PUBLIC_SUPABASE_URL),
        NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: has(process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY),
        SUPABASE_SECRET_KEY: has(process.env.SUPABASE_SECRET_KEY),
        NEXT_PUBLIC_TURNSTILE_SITE_KEY: has(process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY),
      },
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}

import { connection, NextResponse } from "next/server";

/**
 * Configuration check for the owner: shows WHICH settings are present,
 * never their values. Runs on every request (not prerendered), so it shows
 * the live settings and nothing from the build is baked into a static file.
 */
export async function GET() {
  await connection();
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
        RESEND_API_KEY: has(process.env.RESEND_API_KEY),
        EMAIL_FROM: has(process.env.EMAIL_FROM),
        POLAR_ACCESS_TOKEN: has(process.env.POLAR_ACCESS_TOKEN),
        POLAR_WEBHOOK_SECRET: has(process.env.POLAR_WEBHOOK_SECRET),
        POLAR_SERVER: !process.env.POLAR_SERVER
          ? null
          : ["sandbox", "production"].includes(process.env.POLAR_SERVER.trim())
            ? process.env.POLAR_SERVER.trim()
            : "invalid value",
      },
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}

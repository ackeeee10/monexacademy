import { connection, NextResponse } from "next/server";

import { polarServerValue } from "@/lib/server-env";

/**
 * Configuration check for the owner: shows WHICH settings are present,
 * never their values. Runs on every request (not prerendered), so it shows
 * the live settings and nothing from the build is baked into a static file.
 */
function keyKind(value: string | undefined): string | null {
  const v = value?.trim();
  if (!v) return null;
  if (v.startsWith("sb_secret_")) return "secret";
  if (v.startsWith("sb_publishable_")) return "publishable (wrong key)";
  if (v.startsWith("eyJ")) return "legacy JWT";
  return "unknown";
}

export async function GET() {
  await connection();
  const polarServer = polarServerValue();
  const has = (v: string | undefined) => Boolean(v && v.trim());
  return NextResponse.json(
    {
      ok: true,
      config: {
        NEXT_PUBLIC_SITE_URL: process.env.NEXT_PUBLIC_SITE_URL ?? null,
        NEXT_PUBLIC_SUPABASE_URL: has(process.env.NEXT_PUBLIC_SUPABASE_URL),
        NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: has(process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY),
        SUPABASE_SECRET_KEY: has(process.env.SUPABASE_SECRET_KEY),
        // Kind of key only (never the value): a publishable key here would break webhooks.
        SUPABASE_SECRET_KEY_KIND: keyKind(process.env.SUPABASE_SECRET_KEY),
        NEXT_PUBLIC_TURNSTILE_SITE_KEY: has(process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY),
        RESEND_API_KEY: has(process.env.RESEND_API_KEY),
        EMAIL_FROM: has(process.env.EMAIL_FROM),
        POLAR_ACCESS_TOKEN: has(process.env.POLAR_ACCESS_TOKEN),
        POLAR_WEBHOOK_SECRET: has(process.env.POLAR_WEBHOOK_SECRET),
        POLAR_SERVER: polarServer === null ? null : ["sandbox", "production"].includes(polarServer) ? polarServer : "invalid value",
      },
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}

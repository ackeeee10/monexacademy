import { createServerClient } from "@supabase/ssr";
import type { NextRequest, NextResponse } from "next/server";

import { env, isSupabaseConfigured } from "@/lib/env";

/**
 * Refreshes the Supabase session cookie on every request and reports whether
 * a user is signed in. Cookies are written to both the request (so Server
 * Components in this request see the fresh token) and the response.
 */
export async function updateSession(request: NextRequest, response: NextResponse) {
  if (!isSupabaseConfigured()) return { response, userId: null as string | null };

  const supabase = createServerClient(env.supabaseUrl(), env.supabasePublishableKey(), {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll(cookiesToSet, headers) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
        Object.entries(headers).forEach(([key, value]) => response.headers.set(key, value));
      },
    },
  });

  // Do not put code between createServerClient and getClaims (Supabase guidance).
  const { data } = await supabase.auth.getClaims();
  const userId = typeof data?.claims?.sub === "string" ? data.claims.sub : null;

  return { response, userId };
}

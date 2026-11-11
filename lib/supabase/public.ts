import "server-only";

import { createClient as createSupabaseClient } from "@supabase/supabase-js";

import { env } from "@/lib/env";

/**
 * Anonymous client without cookies, for public data that can be cached
 * across users (categories, skills, public profiles). RLS applies as `anon`.
 */
export function createPublicClient() {
  return createSupabaseClient(env.supabaseUrl(), env.supabasePublishableKey(), {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}

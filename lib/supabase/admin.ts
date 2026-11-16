import "server-only";

import { createClient as createSupabaseClient } from "@supabase/supabase-js";

import { env } from "@/lib/env";

/**
 * Client with the secret key (service_role). Bypasses RLS, so use it only for
 * narrow server tasks that the database explicitly grants to service_role.
 * Returns null when the key isn't configured.
 */
export function createAdminClient() {
  const key = env.supabaseSecretKey();
  if (!key) return null;
  return createSupabaseClient(env.supabaseUrl(), key, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}

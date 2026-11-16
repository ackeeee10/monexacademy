import "server-only";

import { notFound } from "next/navigation";

import { requireAccount, type Account } from "@/lib/auth/account";
import { createClient } from "@/lib/supabase/server";

export type AdminContext = { account: Account; mfaReady: boolean };

/**
 * Guard for admin pages. Non-admins get a 404 (the panel's existence isn't
 * advertised). An admin also needs a second step for this login: an emailed
 * code or an authenticator app (migration 20261117000003). `mfaReady: false`
 * means the page shows the email-code screen. The answer comes from the
 * database's own is_admin(), so the page and the database always agree.
 */
export async function requireAdmin(next: string): Promise<AdminContext> {
  const account = await requireAccount({ next });
  if (account.role !== "admin") notFound();
  const supabase = await createClient();
  const { data } = await supabase.rpc("is_admin");
  return { account, mfaReady: data === true };
}

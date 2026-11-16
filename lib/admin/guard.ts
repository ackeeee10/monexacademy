import "server-only";

import { notFound } from "next/navigation";

import { requireAccount, type Account } from "@/lib/auth/account";
import { createClient } from "@/lib/supabase/server";

export type AdminContext = { account: Account; mfaReady: boolean };

/**
 * Guard for admin pages. Non-admins get a 404 (the panel's existence isn't
 * advertised). No second step for now (owner decision 16. 11. 2026, migration
 * 20261117000004; 2FA returns after launch). The answer comes from the
 * database's own is_admin(), so the page and the database always agree.
 */
export async function requireAdmin(next: string): Promise<AdminContext> {
  const account = await requireAccount({ next });
  if (account.role !== "admin") notFound();
  const supabase = await createClient();
  const { data } = await supabase.rpc("is_admin");
  return { account, mfaReady: data === true };
}

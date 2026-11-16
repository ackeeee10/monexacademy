import "server-only";

import { notFound } from "next/navigation";

import { requireAccount, type Account } from "@/lib/auth/account";
import { createClient } from "@/lib/supabase/server";

export type AdminContext = { account: Account; mfaReady: boolean };

/**
 * Guard for admin pages. Non-admins get a 404 (the panel's existence isn't
 * advertised). 2FA is optional for now (owner decision 16. 11. 2026, migration
 * 20261117000002): if the admin has turned it on, the session must have passed it.
 * The database checks the same rules again.
 */
export async function requireAdmin(next: string): Promise<AdminContext> {
  const account = await requireAccount({ next });
  if (account.role !== "admin") notFound();
  const supabase = await createClient();
  const { data } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
  const hasFactor = data?.nextLevel === "aal2";
  return { account, mfaReady: !hasFactor || data?.currentLevel === "aal2" };
}

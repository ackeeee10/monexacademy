import "server-only";

import { notFound } from "next/navigation";

import { requireAccount, type Account } from "@/lib/auth/account";
import { createClient } from "@/lib/supabase/server";

export type AdminContext = { account: Account; mfaReady: boolean };

/**
 * Guard for admin pages. Non-admins get a 404 (the panel's existence isn't
 * advertised). Admins without a 2FA session get `mfaReady: false`, and the page
 * shows how to turn 2FA on. The database checks the same rules again.
 */
export async function requireAdmin(next: string): Promise<AdminContext> {
  const account = await requireAccount({ next });
  if (account.role !== "admin") notFound();
  const supabase = await createClient();
  const { data } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
  return { account, mfaReady: data?.currentLevel === "aal2" };
}

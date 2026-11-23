"use server";

import { getLocale } from "next-intl/server";
import { z } from "zod";

import { getAccount } from "@/lib/auth/account";
import { getRequestOrigin } from "@/lib/auth/origin";
import type { ActionResult } from "@/lib/auth/types";

import { CATALOG, PRODUCT_KEYS } from "./catalog";
import { getPolar } from "./polar";
import { POLAR_PRODUCTS } from "./polar-products";
import { TRIAL } from "./plans";
import { getBilling } from "./queries";

export type BillingRedirect = { url: string; external: boolean };

const input = z.object({ product: z.enum(PRODUCT_KEYS) });

async function localePath(path: string): Promise<string> {
  return `/${await getLocale()}${path}`;
}

async function portalUrl(userId: string, returnPath: string): Promise<string | null> {
  const polar = getPolar();
  if (!polar) return null;
  try {
    const session = await polar.customerSessions.create({
      external_customer_id: userId,
      return_url: `${await getRequestOrigin()}${await localePath(returnPath)}`,
    });
    return session.customer_portal_url;
  } catch (error) {
    console.error("[billing] portal", error);
    return null;
  }
}

/**
 * Starts a Polar checkout for a plan or credit pack. Guests go to login first;
 * people who already have a plan manage it in the billing portal instead.
 */
export async function startCheckoutAction(value: z.input<typeof input>): Promise<ActionResult<BillingRedirect>> {
  const parsed = input.safeParse(value);
  if (!parsed.success) return { ok: false, error: "invalidInput" };
  const item = CATALOG[parsed.data.product];

  const account = await getAccount();
  if (!account) {
    return { ok: true, data: { url: `/login?next=${encodeURIComponent("/pricing")}`, external: false } };
  }
  if (account.isBlocked || account.deletedAt) return { ok: false, error: "accountBlocked" };
  if (account.ageCheckRequired) return { ok: true, data: { url: "/confirm-age", external: false } };
  if (!account.onboardingCompleted) return { ok: true, data: { url: "/onboarding", external: false } };

  const polar = getPolar();
  if (!polar) return { ok: false, error: "checkoutUnavailable" };

  const billing = await getBilling();
  if (!billing) return { ok: false, error: "unexpected" };

  if (item.kind === "subscription" && billing.subscription) {
    const url = await portalUrl(account.id, "/wallet");
    return url ? { ok: true, data: { url, external: true } } : { ok: false, error: "billingPortalUnavailable" };
  }

  const withTrial = item.kind === "subscription" && item.plan === "pro" && !billing.trialUsed;
  const origin = await getRequestOrigin();
  try {
    const checkout = await polar.checkouts.create({
      products: [POLAR_PRODUCTS[item.key]],
      external_customer_id: account.id,
      customer_email: account.email,
      metadata: { user_id: account.id, product_key: item.key },
      success_url: `${origin}${await localePath(`/wallet?checkout=success&product=${item.key}`)}`,
      return_url: `${origin}${await localePath("/pricing")}`,
      allow_trial: withTrial,
      ...(withTrial ? { trial_interval: "day" as const, trial_interval_count: TRIAL.days } : {}),
    });
    return { ok: true, data: { url: checkout.url, external: true } };
  } catch (error) {
    console.error("[billing] checkout", error);
    return { ok: false, error: "checkoutUnavailable" };
  }
}

/** Opens Polar's customer portal: change or cancel the plan, cards, invoices. */
export async function openBillingPortalAction(): Promise<ActionResult<BillingRedirect>> {
  const account = await getAccount();
  if (!account) return { ok: false, error: "sessionExpired" };
  const url = await portalUrl(account.id, "/wallet");
  return url ? { ok: true, data: { url, external: true } } : { ok: false, error: "billingPortalUnavailable" };
}

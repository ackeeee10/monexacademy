import "server-only";

import { createPolar } from "@polar-sh/sdk/2026-10";

import { env } from "@/lib/env";

/** Polar client, or null when the access token isn't configured. */
export function getPolar() {
  const accessToken = env.polarAccessToken();
  if (!accessToken) return null;
  return createPolar({ accessToken, environment: env.polarServer(), timeout: 20 });
}

/** Checkout works only when both the token and the webhook secret are set. */
export function isCheckoutEnabled(): boolean {
  return Boolean(env.polarAccessToken() && env.polarWebhookSecret());
}

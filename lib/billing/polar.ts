import "server-only";

import { createPolar } from "@polar-sh/sdk/2026-10";

import { serverEnv } from "@/lib/server-env";

/** Polar client, or null when the access token isn't configured. */
export function getPolar() {
  const accessToken = serverEnv.polarAccessToken();
  if (!accessToken) return null;
  return createPolar({ accessToken, environment: serverEnv.polarServer(), timeout: 20 });
}

/** Checkout works only when both the token and the webhook secret are set. */
export function isCheckoutEnabled(): boolean {
  return Boolean(serverEnv.polarAccessToken() && serverEnv.polarWebhookSecret());
}

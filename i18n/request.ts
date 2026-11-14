import { hasLocale } from "next-intl";
import { getRequestConfig } from "next-intl/server";
import { locale as localeParam } from "next/root-params";

import { routing } from "./routing";

/**
 * Root params are only available while rendering a route. Server Actions
 * (sign in, sign out, onboarding…) can't read them, so fall back to the
 * locale next-intl detected for the request, then to the default.
 */
async function readRootLocale(): Promise<string | undefined> {
  try {
    return await localeParam();
  } catch {
    return undefined;
  }
}

export default getRequestConfig(async ({ requestLocale }) => {
  const requested = (await readRootLocale()) ?? (await requestLocale);
  const locale = hasLocale(routing.locales, requested) ? requested : routing.defaultLocale;

  return {
    locale,
    messages: (await import(`../messages/${locale}.json`)).default,
  };
});

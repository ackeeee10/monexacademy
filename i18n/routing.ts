import { defineRouting } from "next-intl/routing";

export const routing = defineRouting({
  // English at launch; add locales here later (e.g. "de", "es").
  locales: ["en"],
  defaultLocale: "en",
  // Default locale has no prefix: /ideas, not /en/ideas.
  localePrefix: "as-needed",
});

export type AppLocale = (typeof routing.locales)[number];

/**
 * Plans and credit packages as shown on the site (Master Prompt 7.2 and 7.4).
 * Charging happens at the payment provider (Phase 5B); these are display values,
 * and the database's plan_limits / credit_prices are the source for the rules.
 */
export const PLANS = [
  { id: "free", monthlyUsd: 0, yearlyUsd: 0, credits: "10 once", posts: "2 total", featured: 0 },
  { id: "pro", monthlyUsd: 9.99, yearlyUsd: 99.9, credits: "60 / month", posts: "10 / month", featured: 1 },
  { id: "elite", monthlyUsd: 24.99, yearlyUsd: 249.9, credits: "200 / month", posts: "Unlimited", featured: 5 },
] as const;

export type PlanId = (typeof PLANS)[number]["id"];

export const CREDIT_PACKAGES = [
  { id: "credits_50", credits: 50, usd: 4.99 },
  { id: "credits_150", credits: 150, usd: 12.99 },
  { id: "credits_500", credits: 500, usd: 34.99 },
] as const;

export const TRIAL = { days: 7, credits: 15 } as const;

/** False until Phase 5B connects the payment provider. */
export const CHECKOUT_ENABLED = false;

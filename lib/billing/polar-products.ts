/**
 * Polar product IDs (sandbox). Product IDs are public identifiers, not secrets:
 * the access token and webhook secret live only in Netlify environment variables.
 * Swap these for the production IDs when Polar goes live.
 */
export const POLAR_PRODUCTS = {
  pro_month: "1fb086f3-5ad2-44b0-a33c-a17bc7fb2ed8",
  pro_year: "d55fce70-4ced-4801-9a63-dedfb6973b9c",
  elite_month: "de2e1d6d-fae2-4e72-ac63-6a750437a18d",
  elite_year: "8a8a6fb3-7abb-44c9-9496-3a0f98bdcf25",
  credits_50: "433c5309-51cf-47d6-8474-c66b3067004e",
  credits_150: "de56e44a-35fe-4938-90db-20c320120246",
  credits_500: "3fd65a20-d3a0-437d-8e4a-ed36df2ab5f2",
} as const;

export type PolarProductKey = keyof typeof POLAR_PRODUCTS;

/**
 * Polar product IDs. Product IDs are public identifiers, not secrets: the
 * access token and webhook secret live only in Netlify environment variables.
 * Which set is used depends on POLAR_SERVER (sandbox on dev, production at launch).
 */
const SANDBOX = {
  pro_month: "1fb086f3-5ad2-44b0-a33c-a17bc7fb2ed8",
  pro_year: "d55fce70-4ced-4801-9a63-dedfb6973b9c",
  elite_month: "de2e1d6d-fae2-4e72-ac63-6a750437a18d",
  elite_year: "8a8a6fb3-7abb-44c9-9496-3a0f98bdcf25",
  credits_50: "433c5309-51cf-47d6-8474-c66b3067004e",
  credits_150: "de56e44a-35fe-4938-90db-20c320120246",
  credits_500: "3fd65a20-d3a0-437d-8e4a-ed36df2ab5f2",
} as const;

const PRODUCTION: Record<keyof typeof SANDBOX, string> = {
  pro_month: "52334a88-cb66-4f94-b7d8-72bfe3f8720e",
  pro_year: "057f8b6c-ce7a-4589-b217-6eb778bcfd84",
  elite_month: "4341559f-5fde-48d9-a5b0-71c353582739",
  elite_year: "b6435741-16cd-40cd-b7de-da66dba601df",
  credits_50: "49bfb624-6b59-4e2a-9fd9-f9982100856f",
  credits_150: "9c2a5809-ee17-4802-8c53-e074867baabb",
  credits_500: "d5eda28a-e562-4871-bc3d-9b14bf233aed",
};

export type PolarProductKey = keyof typeof SANDBOX;

export const POLAR_PRODUCT_KEYS = Object.keys(SANDBOX) as PolarProductKey[];

/** Product IDs for the given Polar environment. */
export function polarProducts(server: "sandbox" | "production"): Record<PolarProductKey, string> {
  return server === "production" ? PRODUCTION : SANDBOX;
}

/** Finds our key for a Polar product id from either environment. */
export function productKeyForId(productId: string): PolarProductKey | null {
  return POLAR_PRODUCT_KEYS.find((k) => SANDBOX[k] === productId || PRODUCTION[k] === productId) ?? null;
}

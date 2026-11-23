import { CREDIT_PACKAGES } from "./plans";
import { productKeyForId, type PolarProductKey } from "./polar-products";

export type ProductKey = PolarProductKey;

export type CatalogItem =
  | { key: ProductKey; kind: "subscription"; plan: "pro" | "elite"; interval: "month" | "year" }
  | { key: ProductKey; kind: "credits"; credits: number };

const credits = (id: (typeof CREDIT_PACKAGES)[number]["id"]) => CREDIT_PACKAGES.find((p) => p.id === id)!.credits;

/** What each purchasable product gives. Keys match the Polar product maps. */
export const CATALOG: Record<ProductKey, CatalogItem> = {
  pro_month: { key: "pro_month", kind: "subscription", plan: "pro", interval: "month" },
  pro_year: { key: "pro_year", kind: "subscription", plan: "pro", interval: "year" },
  elite_month: { key: "elite_month", kind: "subscription", plan: "elite", interval: "month" },
  elite_year: { key: "elite_year", kind: "subscription", plan: "elite", interval: "year" },
  credits_50: { key: "credits_50", kind: "credits", credits: credits("credits_50") },
  credits_150: { key: "credits_150", kind: "credits", credits: credits("credits_150") },
  credits_500: { key: "credits_500", kind: "credits", credits: credits("credits_500") },
};

export const PRODUCT_KEYS = Object.keys(CATALOG) as [ProductKey, ...ProductKey[]];

export function isProductKey(value: string): value is ProductKey {
  return value in CATALOG;
}

/** Finds the catalog item for a Polar product id. */
export function catalogByProductId(productId: string | null | undefined): CatalogItem | null {
  if (!productId) return null;
  const key = productKeyForId(productId);
  return key ? CATALOG[key] : null;
}

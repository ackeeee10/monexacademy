const usd = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });

/** "$1,500" style amount for ideas (USD, whole dollars). */
export function formatUsd(amount: number): string {
  return usd.format(amount);
}

/** Earnings range as shown on cards and the detail page, e.g. "$800–$2,500". */
export function formatEarningRange(min: number, max: number): string {
  return `${formatUsd(min)}–${formatUsd(max)}`;
}

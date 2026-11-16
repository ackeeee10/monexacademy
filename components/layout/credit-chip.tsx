import { Coins } from "lucide-react";
import { useTranslations } from "next-intl";

import { Link } from "@/i18n/navigation";

/** Credit balance in the header; opens the wallet. */
export function CreditChip({ credits }: { credits: number }) {
  const t = useTranslations("Wallet");
  return (
    <Link
      href="/wallet"
      aria-label={t("chipLabel", { count: credits })}
      className="tabular inline-flex h-9 items-center gap-1.5 rounded-full border border-border px-3 text-sm font-medium text-text transition-colors hover:border-accent/50"
    >
      <Coins className="size-4 text-accent" aria-hidden />
      {credits.toLocaleString("en-US")}
    </Link>
  );
}

"use client";

import { Sparkles } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";

import { runAction } from "@/components/auth/run-action";
import { useErrorMessage } from "@/components/auth/use-error";
import { Button } from "@/components/ui/button";
import { Link, useRouter } from "@/i18n/navigation";
import { featureIdeaAction } from "@/lib/credits/actions";

/** Author's "Feature for 7 days" button with the cost shown up front. */
export function FeatureButton({ ideaId, cost, balance }: { ideaId: string; cost: number; balance: number }) {
  const t = useTranslations("Ideas.detail");
  const errorMessage = useErrorMessage();
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const run = () => {
    setError(null);
    startTransition(async () => {
      const result = await runAction(() => featureIdeaAction({ ideaId, maxCost: cost }));
      if (!result.ok) {
        setError(errorMessage(result.error) ?? null);
        return;
      }
      setConfirming(false);
      router.refresh();
    });
  };

  if (cost > balance) {
    return (
      <div className="flex flex-wrap items-center gap-3">
        <Button variant="secondary" disabled>
          <Sparkles aria-hidden />
          {t("feature")} · {t("featureCost", { cost })}
        </Button>
        <Link href="/pricing" className="text-sm text-accent hover:underline">{t("getCredits")}</Link>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-start gap-2">
      {confirming ? (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm text-text">{t("featureConfirm", { cost })}</span>
          <Button size="sm" onClick={run} disabled={pending}>{t("confirm")}</Button>
          <Button size="sm" variant="ghost" onClick={() => setConfirming(false)} disabled={pending}>{t("unlockCancel")}</Button>
        </div>
      ) : (
        <Button variant="secondary" onClick={() => setConfirming(true)}>
          <Sparkles aria-hidden />
          {t("feature")} · {t("featureCost", { cost })}
        </Button>
      )}
      {error && <p role="alert" className="text-sm text-danger">{error}</p>}
    </div>
  );
}

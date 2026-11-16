"use client";

import { Unlock } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";

import { runAction } from "@/components/auth/run-action";
import { useErrorMessage } from "@/components/auth/use-error";
import { Button } from "@/components/ui/button";
import { Link, useRouter } from "@/i18n/navigation";
import { unlockIdeaAction } from "@/lib/credits/actions";

type Props = {
  ideaId: string;
  cost: number;
  /** Null for guests. */
  balance: number | null;
  returnPath: string;
};

/** Unlock with credits: asks once, then pays and reloads the page with the full plan. */
export function UnlockButton({ ideaId, cost, balance, returnPath }: Props) {
  const t = useTranslations("Ideas.detail");
  const errorMessage = useErrorMessage();
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  if (balance === null) {
    return (
      <Button asChild>
        <Link href={`/login?next=${encodeURIComponent(returnPath)}`}>{t("signInToUnlock")}</Link>
      </Button>
    );
  }

  if (balance < cost) {
    return (
      <div className="flex flex-col items-center gap-2">
        <p className="text-sm text-muted">{t("notEnough", { cost, count: balance })}</p>
        <Button asChild>
          <Link href="/pricing">{t("getCredits")}</Link>
        </Button>
      </div>
    );
  }

  const confirm = () => {
    setError(null);
    startTransition(async () => {
      const result = await runAction(() => unlockIdeaAction({ ideaId, maxCost: cost }));
      if (!result.ok) {
        setError(errorMessage(result.error) ?? null);
        return;
      }
      router.refresh();
    });
  };

  return (
    <div className="flex max-w-sm flex-col items-center gap-3">
      {confirming ? (
        <>
          <p className="text-sm text-text">{t("unlockConfirm", { cost })}</p>
          <div className="flex gap-2">
            <Button onClick={confirm} disabled={pending}>{t("unlockYes")}</Button>
            <Button variant="ghost" onClick={() => setConfirming(false)} disabled={pending}>{t("unlockCancel")}</Button>
          </div>
        </>
      ) : (
        <Button onClick={() => setConfirming(true)}>
          <Unlock aria-hidden />
          {t("unlock", { cost })}
        </Button>
      )}
      <p className="text-xs text-muted">{t("unlockBalance", { count: balance })}</p>
      {error && <p role="alert" className="text-sm text-danger">{error}</p>}
    </div>
  );
}

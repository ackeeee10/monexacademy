"use client";

import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";

import { runAction } from "@/components/auth/run-action";
import { useErrorMessage } from "@/components/auth/use-error";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { useRouter } from "@/i18n/navigation";
import { adjustCreditsAction } from "@/lib/admin/actions";

/** Admin form: add (positive) or remove (negative) credits with a reason. */
export function CreditAdjust({ userId }: { userId: string }) {
  const t = useTranslations("Admin");
  const errorMessage = useErrorMessage();
  const router = useRouter();
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("");
  const [notice, setNotice] = useState<{ tone: "success" | "danger"; text: string } | null>(null);
  const [pending, startTransition] = useTransition();

  const apply = () => {
    setNotice(null);
    startTransition(async () => {
      const result = await runAction(() => adjustCreditsAction({ userId, amount: Number(amount), reason }));
      if (!result.ok) {
        const field = result.fields ? Object.values(result.fields)[0] : undefined;
        setNotice({ tone: "danger", text: errorMessage(field || result.error) ?? "" });
        return;
      }
      setAmount("");
      setReason("");
      setNotice({ tone: "success", text: t("done") });
      router.refresh();
    });
  };

  return (
    <div className="space-y-4">
      {notice && <Alert variant={notice.tone}>{notice.text}</Alert>}
      <div className="grid gap-4 sm:grid-cols-[160px_1fr]">
        <Field id="credit-amount" label={t("credits.amount")} hint={t("credits.amountHint")}>
          <Input id="credit-amount" aria-describedby="credit-amount-hint" type="number" step={1} value={amount} onChange={(e) => setAmount(e.target.value)} />
        </Field>
        <Field id="credit-reason" label={t("credits.reason")} hint={t("credits.reasonHint")}>
          <Input id="credit-reason" aria-describedby="credit-reason-hint" value={reason} maxLength={500} onChange={(e) => setReason(e.target.value)} />
        </Field>
      </div>
      <Button type="button" variant="secondary" disabled={pending || !amount || !reason.trim()} onClick={apply}>
        {pending ? t("saving") : t("credits.apply")}
      </Button>
    </div>
  );
}

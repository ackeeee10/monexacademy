"use client";

import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";

import { runAction } from "@/components/auth/run-action";
import { useErrorMessage } from "@/components/auth/use-error";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field, Select, Textarea } from "@/components/ui/field";
import { useRouter } from "@/i18n/navigation";
import { updateUserAction } from "@/lib/admin/actions";

type Props = {
  userId: string;
  username: string | null;
  isBlocked: boolean;
  ageCheckRequired: boolean;
  trustLevel: "new" | "trusted";
  role: "user" | "moderator";
};

type Change = Parameters<typeof updateUserAction>[2];

/** Block, age check, trust level and role for one user. */
export function UserActions({ userId, username, isBlocked, ageCheckRequired, trustLevel, role }: Props) {
  const t = useTranslations("Admin");
  const errorMessage = useErrorMessage();
  const router = useRouter();
  const [reason, setReason] = useState("");
  const [notice, setNotice] = useState<{ tone: "success" | "danger"; text: string } | null>(null);
  const [pending, startTransition] = useTransition();

  const run = (change: Change) => {
    setNotice(null);
    startTransition(async () => {
      const result = await runAction(() => updateUserAction(userId, username, change));
      if (!result.ok) {
        setNotice({ tone: "danger", text: errorMessage(result.error) ?? "" });
        return;
      }
      setReason("");
      setNotice({ tone: "success", text: t("done") });
      router.refresh();
    });
  };

  const dangerClass = "border-danger/50 text-danger hover:border-danger hover:bg-danger/10";

  return (
    <div className="space-y-6 rounded-lg border border-border bg-surface p-5">
      {notice && <Alert variant={notice.tone}>{notice.text}</Alert>}

      <Field id="admin-reason" label={t("users.reason")} hint={t("users.reasonHint")}>
        <Textarea
          id="admin-reason"
          aria-describedby="admin-reason-hint"
          value={reason}
          maxLength={1000}
          className="min-h-20"
          onChange={(e) => setReason(e.target.value)}
        />
      </Field>

      <div className="space-y-2">
        <Button
          type="button"
          variant="secondary"
          className={isBlocked ? undefined : dangerClass}
          disabled={pending}
          onClick={() => run({ kind: "block", blocked: !isBlocked, reason })}
        >
          {isBlocked ? t("users.unblock") : t("users.block")}
        </Button>
        <p className="text-xs text-muted">{t("users.blockHelp")}</p>
      </div>

      <div className="space-y-2">
        <Button
          type="button"
          variant="secondary"
          className={ageCheckRequired ? undefined : dangerClass}
          disabled={pending}
          onClick={() => run({ kind: "ageCheck", required: !ageCheckRequired, reason })}
        >
          {ageCheckRequired ? t("users.ageCheckOff") : t("users.ageCheckOn")}
        </Button>
        <p className="text-xs text-muted">{t("users.ageHelp")}</p>
      </div>

      <div className="grid gap-5 md:grid-cols-2">
        <Field id="admin-trust" label={t("users.trustLabel")} hint={t("users.trustHelp")}>
          <Select
            id="admin-trust"
            aria-describedby="admin-trust-hint"
            value={trustLevel}
            disabled={pending}
            onChange={(e) => run({ kind: "trust", level: e.target.value as "new" | "trusted", reason })}
          >
            <option value="new">{t("users.trust.new")}</option>
            <option value="trusted">{t("users.trust.trusted")}</option>
          </Select>
        </Field>
        <Field id="admin-role" label={t("users.roleLabel")} hint={t("users.roleHelp")}>
          <Select
            id="admin-role"
            aria-describedby="admin-role-hint"
            value={role}
            disabled={pending}
            onChange={(e) => run({ kind: "role", role: e.target.value as "user" | "moderator" })}
          >
            <option value="user">{t("users.role.user")}</option>
            <option value="moderator">{t("users.role.moderator")}</option>
          </Select>
        </Field>
      </div>
    </div>
  );
}

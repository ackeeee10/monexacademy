"use client";

import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";

import { runAction } from "@/components/auth/run-action";
import { useErrorMessage } from "@/components/auth/use-error";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field, Textarea } from "@/components/ui/field";
import { useRouter } from "@/i18n/navigation";
import { moderateIdeaAction } from "@/lib/admin/actions";
import type { IdeaStatus } from "@/lib/ideas/queries";

type Action = "approve" | "reject" | "request_changes" | "hide" | "restore";

const ACTIONS_BY_STATUS: Partial<Record<IdeaStatus, Action[]>> = {
  pending: ["approve", "request_changes", "reject"],
  approved: ["hide"],
  hidden: ["restore"],
};

/** Approve / reject / request changes / hide / restore, with a note for the author. */
export function ModerationPanel({ ideaId, status }: { ideaId: string; status: IdeaStatus }) {
  const t = useTranslations("Admin.moderation");
  const errorMessage = useErrorMessage();
  const router = useRouter();
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const actions = ACTIONS_BY_STATUS[status] ?? [];

  if (actions.length === 0) return null;

  const run = (action: Action) => {
    setError(null);
    startTransition(async () => {
      const result = await runAction(() => moderateIdeaAction({ ideaId, action, note }));
      if (!result.ok) {
        setError(errorMessage(result.error) ?? null);
        return;
      }
      setNote("");
      router.refresh();
    });
  };

  return (
    <div className="space-y-4 rounded-lg border border-border bg-surface p-5">
      {error && <Alert variant="danger">{error}</Alert>}
      <Field id="moderation-note" label={t("note")} hint={t("noteHint")}>
        <Textarea
          id="moderation-note"
          aria-describedby="moderation-note-hint"
          value={note}
          maxLength={1000}
          className="min-h-24"
          onChange={(e) => setNote(e.target.value)}
        />
      </Field>
      <div className="flex flex-wrap gap-3">
        {actions.map((action) => (
          <Button
            key={action}
            type="button"
            disabled={pending}
            variant={action === "approve" || action === "restore" ? "primary" : "secondary"}
            className={action === "reject" || action === "hide" ? "border-danger/50 text-danger hover:border-danger hover:bg-danger/10" : undefined}
            onClick={() => run(action)}
          >
            {t(action)}
          </Button>
        ))}
      </div>
    </div>
  );
}

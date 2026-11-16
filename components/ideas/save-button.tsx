"use client";

import { Bookmark, BookmarkCheck } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";

import { runAction } from "@/components/auth/run-action";
import { useErrorMessage } from "@/components/auth/use-error";
import { Button } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";
import { setIdeaSavedAction } from "@/lib/ideas/actions";

type Props = {
  ideaId: string;
  initialSaved: boolean;
  signedIn: boolean;
  /** Where to return after signing in (the idea's own page). */
  returnPath: string;
};

/** Save or unsave an idea. Guests are sent to sign in first. */
export function SaveButton({ ideaId, initialSaved, signedIn, returnPath }: Props) {
  const t = useTranslations("Ideas.detail");
  const errorMessage = useErrorMessage();
  const [saved, setSaved] = useState(initialSaved);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  if (!signedIn) {
    return (
      <Button asChild variant="secondary">
        <Link href={`/login?next=${encodeURIComponent(returnPath)}`}>
          <Bookmark aria-hidden />
          {t("signInToSave")}
        </Link>
      </Button>
    );
  }

  const toggle = () => {
    const next = !saved;
    setError(null);
    setSaved(next); // optimistic; reverted below if the server refuses
    startTransition(async () => {
      const result = await runAction(() => setIdeaSavedAction(ideaId, next));
      if (!result.ok) {
        setSaved(!next);
        setError(errorMessage(result.error) ?? null);
      }
    });
  };

  return (
    <div className="flex flex-col items-start gap-2">
      <Button variant={saved ? "secondary" : "primary"} onClick={toggle} disabled={pending} aria-pressed={saved}>
        {saved ? <BookmarkCheck aria-hidden /> : <Bookmark aria-hidden />}
        {saved ? t("saved") : t("save")}
      </Button>
      {error && (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}
    </div>
  );
}

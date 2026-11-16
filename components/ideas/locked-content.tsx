import { Lock } from "lucide-react";
import { getTranslations } from "next-intl/server";
import type { ReactNode } from "react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import type { IdeaLockedContent } from "@/lib/ideas/queries";

/**
 * Full plan, market analysis, risks and checklist. When `content` is null the
 * database has refused it, so nothing sensitive is rendered: only blurred
 * placeholder bars and a locked notice.
 */
export async function LockedContent({ content }: { content: IdeaLockedContent | null }) {
  const t = await getTranslations("Ideas.detail");

  if (!content) {
    return (
      <Card className="relative overflow-hidden p-6 md:p-8">
        <div aria-hidden className="select-none space-y-3 blur-[6px]">
          {Array.from({ length: 7 }).map((_, i) => (
            <div key={i} className="h-3 rounded bg-surface-2" style={{ width: `${62 + ((i * 17) % 35)}%` }} />
          ))}
        </div>
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 bg-bg/70 p-6 text-center backdrop-blur-[2px]">
          <span className="flex size-11 items-center justify-center rounded-full border border-accent/40 bg-accent/10 text-accent">
            <Lock className="size-5" aria-hidden />
          </span>
          <div className="space-y-1">
            <h2 className="text-lg font-semibold text-text">{t("lockedTitle")}</h2>
            <p className="max-w-md text-sm text-muted">{t("lockedBody")}</p>
          </div>
          <Button disabled variant="secondary">
            {t("unlock")}
          </Button>
          <p className="text-xs text-muted">{t("unlockLater")}</p>
        </div>
      </Card>
    );
  }

  const sections: { title: string; body: ReactNode }[] = [
    {
      title: t("launchPlan"),
      body: content.launchPlan.length ? (
        <ol className="list-decimal space-y-2 pl-5 text-sm leading-relaxed text-text marker:text-accent">
          {content.launchPlan.map((step, i) => (
            <li key={i}>{step}</li>
          ))}
        </ol>
      ) : (
        <p className="text-sm text-muted">{t("noContent")}</p>
      ),
    },
    {
      title: t("marketAnalysis"),
      body: <Paragraph text={content.marketAnalysis} empty={t("noContent")} />,
    },
    { title: t("risks"), body: <Paragraph text={content.risks} empty={t("noContent")} /> },
    {
      title: t("checklist"),
      body: content.checklist.length ? (
        <ul className="space-y-2 text-sm text-text">
          {content.checklist.map((item, i) => (
            <li key={i} className="flex gap-3">
              <span aria-hidden className="mt-2 size-1.5 shrink-0 rounded-full bg-accent" />
              {item}
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-muted">{t("noContent")}</p>
      ),
    },
  ];

  return (
    <div className="grid gap-5 md:grid-cols-2">
      {sections.map((s) => (
        <Card key={s.title} className="p-6">
          <h2 className="mb-4 text-base font-semibold text-text">{s.title}</h2>
          {s.body}
        </Card>
      ))}
    </div>
  );
}

function Paragraph({ text, empty }: { text: string | null; empty: string }) {
  if (!text) return <p className="text-sm text-muted">{empty}</p>;
  return <p className="whitespace-pre-line text-sm leading-relaxed text-text">{text}</p>;
}

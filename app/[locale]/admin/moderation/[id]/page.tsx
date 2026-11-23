import { ArrowLeft, ExternalLink } from "lucide-react";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { Suspense } from "react";

import { MfaRequired } from "@/components/admin/admin-shell";
import { ModerationPanel } from "@/components/admin/moderation-panel";
import { IdeaFacts } from "@/components/ideas/idea-facts";
import { LockedContent } from "@/components/ideas/locked-content";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Link } from "@/i18n/navigation";
import { requireAdmin } from "@/lib/admin/guard";
import { getIdeaById, getIdeaLockedContent } from "@/lib/ideas/queries";

type Props = PageProps<"/[locale]/admin/moderation/[id]">;

export default function ReviewIdeaPage({ params }: Props) {
  return (
    <Suspense fallback={<Skeleton className="h-96 w-full" />}>
      <Review params={params} />
    </Suspense>
  );
}

async function Review({ params }: { params: Props["params"] }) {
  const { id } = await params;
  const { mfaReady } = await requireAdmin(`/admin/moderation/${id}`);
  if (!mfaReady) return <MfaRequired />;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();

  const [t, tIdeas, idea, content] = await Promise.all([
    getTranslations("Admin"),
    getTranslations("Ideas"),
    getIdeaById(id),
    getIdeaLockedContent(id),
  ]);
  if (!idea) notFound();

  return (
    <div className="space-y-8">
      <Link href="/admin/moderation" className="inline-flex items-center gap-2 text-sm text-muted hover:text-text">
        <ArrowLeft className="size-4" aria-hidden />
        {t("moderation.backToQueue")}
      </Link>

      <header className="space-y-3">
        <div className="flex flex-wrap items-center gap-2 text-sm text-muted">
          <Badge variant={idea.status === "approved" ? "success" : idea.status === "pending" ? "accent" : "neutral"}>
            {t(`ideaStatus.${idea.status === "draft" ? "pending" : idea.status}`)}
          </Badge>
          <span>{idea.categoryName}</span>
          <span aria-hidden>·</span>
          <span>
            {idea.isOriginal ? tIdeas("byOriginals") : tIdeas("byAuthor", { name: idea.authorUsername ? `@${idea.authorUsername}` : "—" })}
          </span>
        </div>
        <h2 className="text-2xl font-bold text-text">{idea.title}</h2>
        <p className="text-muted">{idea.shortDescription}</p>
        {idea.status === "approved" && (
          <Link href={`/ideas/${idea.slug}`} className="inline-flex items-center gap-1.5 text-sm text-accent hover:underline">
            {t("moderation.viewPublic")}
            <ExternalLink className="size-3.5" aria-hidden />
          </Link>
        )}
      </header>

      {content?.moderationNote && (
        <Alert variant="info">
          <span className="text-muted">{t("moderation.previousNote")}: </span>
          {content.moderationNote}
        </Alert>
      )}

      <ModerationPanel ideaId={idea.id} status={idea.status} />

      <IdeaFacts idea={idea} />

      {(idea.skills.length > 0 || idea.lookingForRoles.length > 0) && (
        <div className="flex flex-wrap gap-2">
          {idea.skills.map((s) => (
            <Badge key={s}>{s}</Badge>
          ))}
          {idea.lookingForRoles.map((r) => (
            <Badge key={r} variant="accent">{r}</Badge>
          ))}
        </div>
      )}

      <LockedContent content={content} />
    </div>
  );
}

import { ArrowLeft, Pencil } from "lucide-react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { Suspense } from "react";

import { IdeaFacts } from "@/components/ideas/idea-facts";
import { LockedContent } from "@/components/ideas/locked-content";
import { SaveButton } from "@/components/ideas/save-button";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Container } from "@/components/ui/container";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert } from "@/components/ui/alert";
import { Link } from "@/i18n/navigation";
import { getAccount } from "@/lib/auth/account";
import { getIdeaBySlug, getIdeaLockedContent, isIdeaSaved } from "@/lib/ideas/queries";

type Props = PageProps<"/[locale]/ideas/[slug]">;

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const idea = await getIdeaBySlug(slug);
  if (!idea || idea.status !== "approved") return { title: "Idea", robots: { index: false } };
  return {
    title: idea.title,
    description: idea.shortDescription,
    openGraph: { type: "article", title: idea.title, description: idea.shortDescription },
    alternates: { canonical: `/ideas/${idea.slug}` },
  };
}

export default function IdeaPage({ params }: Props) {
  return (
    <Container className="py-12 md:py-16">
      <Suspense fallback={<IdeaSkeleton />}>
        <IdeaDetail params={params} />
      </Suspense>
    </Container>
  );
}

async function IdeaDetail({ params }: { params: Props["params"] }) {
  const { slug } = await params;
  const [idea, account, t] = await Promise.all([
    getIdeaBySlug(slug),
    getAccount(),
    getTranslations("Ideas"),
  ]);
  if (!idea) notFound();

  const content = await getIdeaLockedContent(idea.id);
  const isAuthor = content?.isAuthor === true;
  // Non-authors can't see drafts (RLS hides them), so anything here is approved or the author's own.
  const saved = account && !isAuthor ? await isIdeaSaved(idea.id) : false;
  const canEdit = isAuthor && idea.status !== "approved";

  return (
    <div className="mx-auto max-w-5xl">
      <Link href="/ideas" className="inline-flex items-center gap-2 text-sm text-muted hover:text-text">
        <ArrowLeft className="size-4" aria-hidden />
        {t("back")}
      </Link>

      <header className="mt-6 space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          {idea.isMonexOriginal && <Badge variant="accent">{t("monexOriginal")}</Badge>}
          {idea.isFeatured && <Badge variant="accent">{t("featured")}</Badge>}
          <span className="text-sm text-muted">{idea.categoryName}</span>
        </div>
        <h1 className="text-3xl font-bold leading-tight text-text md:text-4xl">{idea.title}</h1>
        <p className="text-sm text-muted">
          {idea.isMonexOriginal
            ? t("byMonex")
            : t("byAuthor", { name: idea.authorUsername ? `@${idea.authorUsername}` : "—" })}
        </p>
        <p className="max-w-3xl text-lg leading-relaxed text-muted">{idea.shortDescription}</p>
      </header>

      {isAuthor && idea.status !== "approved" && (
        <Alert variant={idea.status === "changes_requested" || idea.status === "rejected" ? "danger" : "info"} className="mt-8">
          <p className="font-medium">{t(`status.${idea.status}`)}</p>
          {content?.moderationNote && (
            <p className="mt-2 text-sm">
              <span className="text-muted">{t("detail.reviewerNote")}: </span>
              {content.moderationNote}
            </p>
          )}
        </Alert>
      )}

      <div className="mt-8 flex flex-wrap items-center gap-3">
        {!isAuthor && <SaveButton ideaId={idea.id} initialSaved={saved} signedIn={account !== null} returnPath={`/ideas/${idea.slug}`} />}
        {canEdit && (
          <Button asChild variant="secondary">
            <Link href={`/create/idea?id=${idea.id}`}>
              <Pencil aria-hidden />
              {t("detail.edit")}
            </Link>
          </Button>
        )}
      </div>

      <section className="mt-10" aria-labelledby="facts-heading">
        <h2 id="facts-heading" className="sr-only">
          {t("labels.investment")}
        </h2>
        <IdeaFacts idea={idea} />
        <p className="mt-4 text-xs text-muted">{t("estimateNote")}</p>
      </section>

      {idea.skills.length > 0 && (
        <section className="mt-10 space-y-3" aria-labelledby="skills-heading">
          <h2 id="skills-heading" className="text-sm font-medium text-text">{t("labels.skills")}</h2>
          <ul className="flex flex-wrap gap-2">
            {idea.skills.map((s) => (
              <li key={s}>
                <Badge>{s}</Badge>
              </li>
            ))}
          </ul>
        </section>
      )}

      {idea.lookingForRoles.length > 0 && (
        <section className="mt-6 space-y-3" aria-labelledby="roles-heading">
          <h2 id="roles-heading" className="text-sm font-medium text-text">{t("labels.lookingFor")}</h2>
          <ul className="flex flex-wrap gap-2">
            {idea.lookingForRoles.map((r) => (
              <li key={r}>
                <Badge variant="accent">{r}</Badge>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="mt-12 space-y-5" aria-labelledby="locked-heading">
        <h2 id="locked-heading" className="sr-only">
          {t("detail.launchPlan")}
        </h2>
        <LockedContent content={content} />
      </section>
    </div>
  );
}

function IdeaSkeleton() {
  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <Skeleton className="h-6 w-24" />
      <Skeleton className="h-12 w-3/4" />
      <Skeleton className="h-24 w-full" />
      <Skeleton className="h-64 w-full" />
    </div>
  );
}

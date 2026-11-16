import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { Suspense } from "react";

import { IdeaForm } from "@/components/ideas/idea-form";
import { Alert } from "@/components/ui/alert";
import { Container } from "@/components/ui/container";
import { Skeleton } from "@/components/ui/skeleton";
import { Link } from "@/i18n/navigation";
import { getCategories, getSkills } from "@/lib/account/queries";
import { requireAccount } from "@/lib/auth/account";
import { getIdeaById, getIdeaLockedContent, getIdeaSkillIds } from "@/lib/ideas/queries";
import { EMPTY_VALUES, type IdeaFormValues } from "@/lib/ideas/form-values";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("Ideas.create");
  return { title: t("title"), robots: { index: false } };
}

export default function CreateIdeaPage(props: PageProps<"/[locale]/create/idea">) {
  return (
    <Container className="py-12 md:py-16">
      <Suspense fallback={<Skeleton className="h-[480px] w-full max-w-3xl" />}>
        <CreateIdea searchParams={props.searchParams} />
      </Suspense>
    </Container>
  );
}

async function CreateIdea({ searchParams }: { searchParams: PageProps<"/[locale]/create/idea">["searchParams"] }) {
  const [params] = await Promise.all([searchParams, requireAccount({ next: "/create/idea" })]);
  const t = await getTranslations("Ideas");
  const id = typeof params.id === "string" && /^[0-9a-f-]{36}$/i.test(params.id) ? params.id : null;

  let initialValues: IdeaFormValues = EMPTY_VALUES;
  if (id) {
    const [idea, locked, skillIds] = await Promise.all([
      getIdeaById(id),
      getIdeaLockedContent(id),
      getIdeaSkillIds(id),
    ]);
    // Only the author can edit, and RLS already hides other people's drafts.
    if (!idea || !locked?.isAuthor) notFound();

    if (idea.status === "approved") {
      return (
        <div className="max-w-3xl space-y-6">
          <h1 className="text-3xl font-bold text-text">{t("create.editTitle")}</h1>
          <Alert variant="info">
            <p>{t("detail.unavailable")}</p>
            <p className="mt-2 text-sm">
              <Link href={`/ideas/${idea.slug}`} className="underline underline-offset-4">
                {idea.title}
              </Link>
            </p>
          </Alert>
        </div>
      );
    }

    initialValues = {
      title: idea.title,
      shortDescription: idea.shortDescription,
      categoryId: idea.categoryId,
      investmentRange: idea.investmentRange,
      earningMin: String(idea.earningMin),
      earningMax: String(idea.earningMax),
      difficulty: idea.difficulty,
      timeToFirstIncome: idea.timeToFirstIncome,
      workMode: idea.workMode,
      teamMode: idea.teamMode,
      skillIds,
      lookingForRoles: idea.lookingForRoles,
      launchPlan: locked.launchPlan.length ? locked.launchPlan : ["", "", ""],
      marketAnalysis: locked.marketAnalysis ?? "",
      risks: locked.risks ?? "",
    };
  }

  const [categories, skills] = await Promise.all([getCategories(), getSkills()]);

  return (
    <div className="max-w-3xl space-y-8">
      <div>
        <h1 className="text-3xl font-bold text-text md:text-4xl">
          {id ? t("create.editTitle") : t("create.title")}
        </h1>
        <p className="mt-3 text-muted">{t("create.subtitle")}</p>
      </div>
      <IdeaForm ideaId={id} initialValues={initialValues} categories={categories} skills={skills} />
    </div>
  );
}

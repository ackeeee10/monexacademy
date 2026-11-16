import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { Suspense } from "react";

import { IdeaCard } from "@/components/ideas/idea-card";
import { IdeaFilterBar } from "@/components/ideas/idea-filters";
import { Button } from "@/components/ui/button";
import { Container } from "@/components/ui/container";
import { Skeleton } from "@/components/ui/skeleton";
import { Link } from "@/i18n/navigation";
import { getFeaturedIdeas, getIdeaCategories, searchIdeas } from "@/lib/ideas/queries";
import { ideaFiltersSchema, type IdeaFilters } from "@/lib/validation/idea";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("Pages");
  return { title: t("ideas") };
}

export default function IdeasPage(props: PageProps<"/[locale]/ideas">) {
  return (
    <Container className="py-12 md:py-16">
      <Suspense fallback={<IdeasSkeleton />}>
        <IdeasContent searchParams={props.searchParams} />
      </Suspense>
    </Container>
  );
}

async function IdeasContent({ searchParams }: { searchParams: PageProps<"/[locale]/ideas">["searchParams"] }) {
  const raw = await searchParams;
  const parsed = ideaFiltersSchema.safeParse(
    Object.fromEntries(Object.entries(raw).filter(([, v]) => typeof v === "string" && v !== "")),
  );
  const filters: IdeaFilters = parsed.success ? parsed.data : {};

  // Featured ideas lead the unfiltered first page.
  const showFeatured = Object.keys(filters).every((k) => k === "sort") && !filters.page;
  const [t, categories, result, featured] = await Promise.all([
    getTranslations("Ideas"),
    getIdeaCategories(),
    searchIdeas(filters),
    showFeatured ? getFeaturedIdeas(3) : Promise.resolve([]),
  ]);

  return (
    <>
      <div className="flex flex-col gap-6 md:flex-row md:items-end md:justify-between">
        <div className="max-w-2xl">
          <h1 className="text-3xl font-bold text-text md:text-4xl">{t("title")}</h1>
          <p className="mt-3 text-muted">{t("subtitle")}</p>
        </div>
        <Button asChild variant="secondary">
          <Link href="/create/idea">{t("create.title")}</Link>
        </Button>
      </div>

      <div className="mt-10">
        <IdeaFilterBar current={filters} categories={categories} />
      </div>

      {featured.length > 0 && (
        <section className="mt-10 space-y-4" aria-labelledby="featured-heading">
          <h2 id="featured-heading" className="text-xs font-semibold uppercase tracking-[0.16em] text-accent">
            {t("featured")}
          </h2>
          <ul className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
            {featured.map((idea) => (
              <li key={idea.id} className="min-w-0">
                <IdeaCard idea={idea} />
              </li>
            ))}
          </ul>
        </section>
      )}

      <p className="mt-8 text-sm text-muted" aria-live="polite">
        {t("count", { count: result.total })}
      </p>

      {result.items.length === 0 ? (
        <p className="mt-6 rounded-lg border border-dashed border-border p-10 text-center text-muted">{t("empty")}</p>
      ) : (
        <ul className="mt-6 grid gap-5 md:grid-cols-2 xl:grid-cols-3">
          {result.items.map((idea) => (
            <li key={idea.id} className="min-w-0">
              <IdeaCard idea={idea} />
            </li>
          ))}
        </ul>
      )}

      {result.pageCount > 1 && (
        <nav aria-label="Pagination" className="mt-12 flex items-center justify-between gap-4">
          <PageLink filters={filters} page={result.page - 1} disabled={result.page <= 1} label={t("pagePrev")} />
          <span className="tabular text-sm text-muted">
            {t("pageOf", { page: result.page, total: result.pageCount })}
          </span>
          <PageLink filters={filters} page={result.page + 1} disabled={result.page >= result.pageCount} label={t("pageNext")} />
        </nav>
      )}
    </>
  );
}

function PageLink({ filters, page, disabled, label }: { filters: IdeaFilters; page: number; disabled: boolean; label: string }) {
  if (disabled) {
    return (
      <Button variant="secondary" size="sm" disabled>
        {label}
      </Button>
    );
  }
  const query = new URLSearchParams();
  for (const [k, v] of Object.entries({ ...filters, page: page > 1 ? page : undefined })) {
    if (v !== undefined && v !== "") query.set(k, String(v));
  }
  return (
    <Button asChild variant="secondary" size="sm">
      <Link href={`/ideas?${query.toString()}`}>{label}</Link>
    </Button>
  );
}

function IdeasSkeleton() {
  return (
    <>
      <Skeleton className="h-10 w-64" />
      <Skeleton className="mt-6 h-40 w-full" />
      <div className="mt-8 grid gap-5 md:grid-cols-2 xl:grid-cols-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="h-64" />
        ))}
      </div>
    </>
  );
}

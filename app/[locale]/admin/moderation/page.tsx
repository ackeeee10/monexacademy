import { getFormatter, getTranslations } from "next-intl/server";
import { Suspense } from "react";

import { AdminHeading, EmptyState, MfaRequired, Pager, TabLinks, pageParam, withQuery } from "@/components/admin/admin-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Link } from "@/i18n/navigation";
import { requireAdmin } from "@/lib/admin/guard";
import { ADMIN_PAGE_SIZE, listAdminIdeas } from "@/lib/admin/queries";
import type { IdeaStatus } from "@/lib/ideas/queries";

const STATUSES = ["pending", "changes_requested", "rejected", "approved", "hidden"] as const satisfies readonly IdeaStatus[];
type Props = PageProps<"/[locale]/admin/moderation">;

export default function ModerationPage({ searchParams }: Props) {
  return (
    <Suspense fallback={<Skeleton className="h-96 w-full" />}>
      <Moderation searchParams={searchParams} />
    </Suspense>
  );
}

async function Moderation({ searchParams }: { searchParams: Props["searchParams"] }) {
  const { mfaReady } = await requireAdmin("/admin/moderation");
  if (!mfaReady) return <MfaRequired />;

  const params = await searchParams;
  const status = STATUSES.find((s) => s === params.status) ?? "pending";
  const q = typeof params.q === "string" ? params.q.slice(0, 100) : undefined;
  const page = pageParam(params.page);

  const [t, format, result] = await Promise.all([
    getTranslations("Admin"),
    getFormatter(),
    listAdminIdeas(status, q, page),
  ]);

  return (
    <>
      <AdminHeading title={t("moderation.title")} subtitle={t("moderation.subtitle")} />
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <TabLinks
          active={status}
          tabs={STATUSES.map((s) => ({ value: s, label: t(`ideaStatus.${s}`), href: withQuery("/admin/moderation", { status: s, q }) }))}
        />
        <form method="get" className="flex gap-2">
          <input type="hidden" name="status" value={status} />
          <Input name="q" type="search" defaultValue={q ?? ""} placeholder={t("searchPlaceholder")} aria-label={t("search")} className="w-56" />
          <Button type="submit" variant="secondary">{t("search")}</Button>
        </form>
      </div>
      <p className="text-sm text-muted">{t("total", { count: result.total })}</p>

      {result.items.length === 0 ? (
        <EmptyState />
      ) : (
        <ul className="space-y-3">
          {result.items.map((idea) => (
            <li key={idea.id}>
              <Card className="flex flex-col gap-4 p-5 md:flex-row md:items-center md:justify-between">
                <div className="min-w-0 space-y-1.5">
                  <div className="flex flex-wrap items-center gap-2 text-xs text-muted">
                    <span>{idea.category}</span>
                    <span aria-hidden>·</span>
                    <span>
                      {idea.source === "monex" ? "Main Quest" : t("moderation.by", { name: idea.authorUsername ? `@${idea.authorUsername}` : "—" })}
                    </span>
                    {idea.authorTrust === "trusted" && <Badge variant="success">{t("moderation.trusted")}</Badge>}
                    {idea.openReports > 0 && <Badge variant="danger">{t("moderation.reports", { count: idea.openReports })}</Badge>}
                  </div>
                  <p className="truncate font-medium text-text">{idea.title}</p>
                  <p className="line-clamp-1 text-sm text-muted">{idea.shortDescription}</p>
                  <p className="text-xs text-muted">
                    {t("moderation.submitted", { date: format.dateTime(new Date(idea.updatedAt), { dateStyle: "medium", timeStyle: "short" }) })}
                  </p>
                </div>
                <Button asChild variant={status === "pending" ? "primary" : "secondary"} size="sm">
                  <Link href={`/admin/moderation/${idea.id}`}>{t("moderation.review")}</Link>
                </Button>
              </Card>
            </li>
          ))}
        </ul>
      )}

      <Pager
        page={page}
        total={result.total}
        pageSize={ADMIN_PAGE_SIZE}
        hrefFor={(p) => withQuery("/admin/moderation", { status, q, page: p })}
      />
    </>
  );
}

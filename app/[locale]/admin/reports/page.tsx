import { getFormatter, getTranslations } from "next-intl/server";
import { Suspense } from "react";

import { AdminHeading, EmptyState, MfaRequired, Pager, TabLinks, pageParam, withQuery } from "@/components/admin/admin-shell";
import { ReportActions } from "@/components/admin/report-actions";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Link } from "@/i18n/navigation";
import { requireAdmin } from "@/lib/admin/guard";
import { ADMIN_PAGE_SIZE, listAdminReports, type AdminReportRow, type ReportStatus } from "@/lib/admin/queries";

const STATUSES: ReportStatus[] = ["open", "resolved", "dismissed"];
type Props = PageProps<"/[locale]/admin/reports">;

export default function ReportsPage({ searchParams }: Props) {
  return (
    <Suspense fallback={<Skeleton className="h-96 w-full" />}>
      <Reports searchParams={searchParams} />
    </Suspense>
  );
}

async function Reports({ searchParams }: { searchParams: Props["searchParams"] }) {
  const { mfaReady } = await requireAdmin("/admin/reports");
  if (!mfaReady) return <MfaRequired />;

  const params = await searchParams;
  const status = STATUSES.find((s) => s === params.status) ?? "open";
  const page = pageParam(params.page);
  const [t, tReport, format, result] = await Promise.all([
    getTranslations("Admin"),
    getTranslations("Report"),
    getFormatter(),
    listAdminReports(status, page),
  ]);

  return (
    <>
      <AdminHeading title={t("reports.title")} subtitle={t("reports.subtitle")} />
      <TabLinks
        active={status}
        tabs={STATUSES.map((s) => ({ value: s, label: t(`reports.status.${s}`), href: withQuery("/admin/reports", { status: s }) }))}
      />
      <p className="text-sm text-muted">{t("total", { count: result.total })}</p>

      {result.items.length === 0 ? (
        <EmptyState />
      ) : (
        <ul className="space-y-3">
          {result.items.map((r) => (
            <li key={r.id}>
              <Card className="space-y-4 p-5">
                <div className="flex flex-wrap items-center gap-2 text-xs text-muted">
                  <Badge variant={r.reason === "suspected_minor" || r.reason === "scam" ? "danger" : "neutral"}>
                    {tReport(`reasons.${r.reason}`)}
                  </Badge>
                  <span>{r.targetType === "idea" ? t("reports.targetIdea") : t("reports.targetProfile")}</span>
                  <span aria-hidden>·</span>
                  <span>{t("reports.reportedBy", { name: r.reporterUsername ? `@${r.reporterUsername}` : "—" })}</span>
                  <span aria-hidden>·</span>
                  <span>{format.dateTime(new Date(r.createdAt), { dateStyle: "medium", timeStyle: "short" })}</span>
                </div>

                <Target report={r} labels={{
                  gone: t("reports.targetGone"),
                  open: t("reports.openTarget"),
                  owner: t("reports.openOwner"),
                  review: t("reports.reviewIdea"),
                }} />

                {r.details && <p className="whitespace-pre-line rounded-md bg-surface-2 p-3 text-sm text-text">{r.details}</p>}
                {r.reason === "suspected_minor" && r.status === "open" && (
                  <p className="text-xs text-muted">{t("reports.minorHint")}</p>
                )}

                {r.status === "open" ? (
                  <ReportActions reportId={r.id} />
                ) : (
                  <p className="text-xs text-muted">
                    {t("reports.resolvedBy", {
                      status: t(`reports.status.${r.status}`),
                      name: r.resolverUsername ? `@${r.resolverUsername}` : "—",
                    })}
                    {r.resolutionNote ? ` — ${r.resolutionNote}` : ""}
                  </p>
                )}
              </Card>
            </li>
          ))}
        </ul>
      )}

      <Pager page={page} total={result.total} pageSize={ADMIN_PAGE_SIZE} hrefFor={(p) => withQuery("/admin/reports", { status, page: p })} />
    </>
  );
}

function Target({ report, labels }: { report: AdminReportRow; labels: { gone: string; open: string; owner: string; review: string } }) {
  const target = report.target;
  if (!target) return <p className="text-sm text-muted">{labels.gone}</p>;
  const linkClass = "text-sm text-accent hover:underline";
  return (
    <div className="space-y-2">
      <p className="font-medium text-text">
        {report.targetType === "idea" ? target.title : target.username ? `@${target.username}` : "—"}
      </p>
      <div className="flex flex-wrap gap-4">
        {report.targetType === "idea" && (
          <Link href={`/admin/moderation/${report.targetId}`} className={linkClass}>{labels.review}</Link>
        )}
        {report.targetType === "idea" && target.status === "approved" && target.slug && (
          <Link href={`/ideas/${target.slug}`} className={linkClass}>{labels.open}</Link>
        )}
        {report.targetType === "profile" && target.username && (
          <Link href={`/u/${target.username}`} className={linkClass}>{labels.open}</Link>
        )}
        {target.ownerId && (
          <Link href={`/admin/users/${target.ownerId}`} className={linkClass}>{labels.owner}</Link>
        )}
      </div>
    </div>
  );
}

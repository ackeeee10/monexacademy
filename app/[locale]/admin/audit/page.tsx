import { getFormatter, getTranslations } from "next-intl/server";
import { Suspense } from "react";

import { AdminHeading, EmptyState, MfaRequired, Pager, pageParam, withQuery } from "@/components/admin/admin-shell";
import { Skeleton } from "@/components/ui/skeleton";
import { requireAdmin } from "@/lib/admin/guard";
import { ADMIN_PAGE_SIZE, listAudit } from "@/lib/admin/queries";

type Props = PageProps<"/[locale]/admin/audit">;

export default function AuditPage({ searchParams }: Props) {
  return (
    <Suspense fallback={<Skeleton className="h-96 w-full" />}>
      <Audit searchParams={searchParams} />
    </Suspense>
  );
}

/** Short human summary of an entry's details (reason, note, title, name). */
function summary(details: Record<string, unknown>): string {
  const parts = ["title", "name", "reason", "note", "level", "role", "to"]
    .map((k) => details[k])
    .filter((v): v is string => typeof v === "string" && v.length > 0);
  return parts.join(" · ");
}

async function Audit({ searchParams }: { searchParams: Props["searchParams"] }) {
  const { mfaReady } = await requireAdmin("/admin/audit");
  if (!mfaReady) return <MfaRequired />;
  const page = pageParam((await searchParams).page);
  const [t, format, result] = await Promise.all([getTranslations("Admin.audit"), getFormatter(), listAudit(page)]);

  return (
    <>
      <AdminHeading title={t("title")} subtitle={t("subtitle")} />
      {result.items.length === 0 ? (
        <EmptyState />
      ) : (
        <div className="overflow-x-auto rounded-lg border border-border">
          <table className="w-full text-left text-sm">
            <thead className="bg-surface-2 text-xs text-muted">
              <tr>
                <th scope="col" className="px-4 py-3 font-medium">{t("when")}</th>
                <th scope="col" className="px-4 py-3 font-medium">{t("action")}</th>
                <th scope="col" className="px-4 py-3 font-medium">{t("actor")}</th>
                <th scope="col" className="px-4 py-3 font-medium">{t("details")}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border bg-surface">
              {result.items.map((e) => (
                <tr key={e.id}>
                  <td className="tabular whitespace-nowrap px-4 py-3 text-muted">
                    {format.dateTime(new Date(e.createdAt), { dateStyle: "short", timeStyle: "short" })}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 font-mono text-xs text-accent">{e.action}</td>
                  <td className="whitespace-nowrap px-4 py-3 text-text">{e.actorUsername ? `@${e.actorUsername}` : t("system")}</td>
                  <td className="px-4 py-3 text-text">{summary(e.details) || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <Pager page={page} total={result.total} pageSize={ADMIN_PAGE_SIZE} hrefFor={(p) => withQuery("/admin/audit", { page: p })} />
    </>
  );
}

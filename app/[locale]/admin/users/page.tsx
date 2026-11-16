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
import { ADMIN_PAGE_SIZE, listAdminUsers, type UserFilter } from "@/lib/admin/queries";

const FILTERS: UserFilter[] = ["all", "blocked", "age_check", "deleted", "trusted", "staff"];
type Props = PageProps<"/[locale]/admin/users">;

export default function UsersPage({ searchParams }: Props) {
  return (
    <Suspense fallback={<Skeleton className="h-96 w-full" />}>
      <Users searchParams={searchParams} />
    </Suspense>
  );
}

async function Users({ searchParams }: { searchParams: Props["searchParams"] }) {
  const { mfaReady } = await requireAdmin("/admin/users");
  if (!mfaReady) return <MfaRequired />;

  const params = await searchParams;
  const filter = FILTERS.find((f) => f === params.filter) ?? "all";
  const q = typeof params.q === "string" ? params.q.slice(0, 100) : undefined;
  const page = pageParam(params.page);
  const [t, format, result] = await Promise.all([getTranslations("Admin"), getFormatter(), listAdminUsers(q, filter, page)]);

  return (
    <>
      <AdminHeading title={t("users.title")} subtitle={t("users.subtitle")} />
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <TabLinks
          active={filter}
          tabs={FILTERS.map((f) => ({ value: f, label: t(`users.filter.${f}`), href: withQuery("/admin/users", { filter: f === "all" ? undefined : f, q }) }))}
        />
        <form method="get" className="flex gap-2">
          {filter !== "all" && <input type="hidden" name="filter" value={filter} />}
          <Input name="q" type="search" defaultValue={q ?? ""} placeholder={t("searchPlaceholder")} aria-label={t("search")} className="w-56" />
          <Button type="submit" variant="secondary">{t("search")}</Button>
        </form>
      </div>
      <p className="text-sm text-muted">{t("total", { count: result.total })}</p>

      {result.items.length === 0 ? (
        <EmptyState />
      ) : (
        <ul className="space-y-2">
          {result.items.map((u) => (
            <li key={u.id}>
              <Link href={`/admin/users/${u.id}`} className="block">
                <Card interactive className="flex flex-col gap-2 p-4 md:flex-row md:items-center md:justify-between">
                  <div className="min-w-0">
                    <p className="truncate font-medium text-text">{u.username ? `@${u.username}` : t("users.noUsername")}</p>
                    <p className="truncate text-sm text-muted">{u.email}</p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2 text-xs text-muted">
                    {u.role !== "user" && <Badge variant="accent">{t(`users.role.${u.role}`)}</Badge>}
                    <Badge variant={u.trustLevel === "trusted" ? "success" : "neutral"}>{t(`users.trust.${u.trustLevel}`)}</Badge>
                    {u.isBlocked && <Badge variant="danger">{t("users.blocked")}</Badge>}
                    {u.ageCheckRequired && <Badge variant="danger">{t("users.ageCheck")}</Badge>}
                    {u.deletedAt && <Badge>{t("users.deleted")}</Badge>}
                    <span>{t("users.joined", { date: format.dateTime(new Date(u.createdAt), { dateStyle: "medium" }) })}</span>
                  </div>
                </Card>
              </Link>
            </li>
          ))}
        </ul>
      )}

      <Pager page={page} total={result.total} pageSize={ADMIN_PAGE_SIZE} hrefFor={(p) => withQuery("/admin/users", { filter: filter === "all" ? undefined : filter, q, page: p })} />
    </>
  );
}

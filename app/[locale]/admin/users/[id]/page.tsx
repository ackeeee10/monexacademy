import { ArrowLeft } from "lucide-react";
import { notFound } from "next/navigation";
import { getFormatter, getTranslations } from "next-intl/server";
import { Suspense } from "react";

import { MfaRequired } from "@/components/admin/admin-shell";
import { UserActions } from "@/components/admin/user-actions";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Link } from "@/i18n/navigation";
import { requireAdmin } from "@/lib/admin/guard";
import { getAdminUser } from "@/lib/admin/queries";
import { countryName } from "@/lib/countries";

type Props = PageProps<"/[locale]/admin/users/[id]">;

export default function AdminUserPage({ params }: Props) {
  return (
    <Suspense fallback={<Skeleton className="h-96 w-full" />}>
      <AdminUser params={params} />
    </Suspense>
  );
}

async function AdminUser({ params }: { params: Props["params"] }) {
  const { id } = await params;
  const { mfaReady, account } = await requireAdmin(`/admin/users/${id}`);
  if (!mfaReady) return <MfaRequired />;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();

  const [t, tIdeas, format, user] = await Promise.all([
    getTranslations("Admin"),
    getTranslations("Admin.ideaStatus"),
    getFormatter(),
    getAdminUser(id),
  ]);
  if (!user) notFound();

  const date = (iso: string) => format.dateTime(new Date(iso), { dateStyle: "medium", timeStyle: "short" });
  const editable = user.id !== account.id && user.role !== "admin";

  return (
    <div className="space-y-8">
      <Link href="/admin/users" className="inline-flex items-center gap-2 text-sm text-muted hover:text-text">
        <ArrowLeft className="size-4" aria-hidden />
        {t("users.backToList")}
      </Link>

      <header className="space-y-2">
        <h2 className="text-2xl font-bold text-text">{user.username ? `@${user.username}` : t("users.noUsername")}</h2>
        <div className="flex flex-wrap gap-2">
          <Badge variant={user.role === "user" ? "neutral" : "accent"}>{t(`users.role.${user.role}`)}</Badge>
          <Badge variant={user.trustLevel === "trusted" ? "success" : "neutral"}>
            {t(`users.trust.${user.trustLevel}`)}
            {user.trustManual ? ` · ${t("users.trustManual")}` : ""}
          </Badge>
          {user.isBlocked && <Badge variant="danger">{t("users.blocked")}</Badge>}
          {user.ageCheckRequired && <Badge variant="danger">{t("users.ageCheck")}</Badge>}
          {user.deletedAt && <Badge>{t("users.deleted")}</Badge>}
        </div>
      </header>

      <Card className="p-5">
        <dl className="grid gap-4 text-sm sm:grid-cols-2">
          <Item label={t("users.email")} value={user.email} />
          <Item label={t("users.plan")} value={user.plan} />
          <Item label={t("users.country")} value={user.country ? countryName(user.country, "en") : "—"} />
          <Item label={t("users.joinedLabel")} value={date(user.createdAt)} />
          <Item label={t("users.reports")} value={t("users.reportsValue", { open: user.openReportsAgainst, total: user.reportsAgainst })} />
          {user.username && (
            <div>
              <dt className="text-xs text-muted">{t("users.profile")}</dt>
              <dd className="mt-1">
                <Link href={`/u/${user.username}`} className="text-accent hover:underline">/u/{user.username}</Link>
              </dd>
            </div>
          )}
        </dl>
      </Card>

      <section className="space-y-3">
        <h3 className="text-lg font-semibold text-text">{t("users.actions")}</h3>
        {editable ? (
          <UserActions
            userId={user.id}
            username={user.username}
            isBlocked={user.isBlocked}
            ageCheckRequired={user.ageCheckRequired}
            trustLevel={user.trustLevel}
            role={user.role === "moderator" ? "moderator" : "user"}
          />
        ) : (
          <Alert variant="info">{t("users.self")}</Alert>
        )}
      </section>

      <section className="space-y-3">
        <h3 className="text-lg font-semibold text-text">{t("users.ideas")}</h3>
        {user.ideas.length === 0 ? (
          <p className="text-sm text-muted">{t("users.noIdeas")}</p>
        ) : (
          <ul className="divide-y divide-border rounded-lg border border-border bg-surface">
            {user.ideas.map((idea) => (
              <li key={idea.id} className="flex items-center justify-between gap-4 px-4 py-3 text-sm">
                <Link href={`/admin/moderation/${idea.id}`} className="truncate text-text hover:text-accent">{idea.title}</Link>
                <Badge>{tIdeas(idea.status === "draft" ? "pending" : idea.status)}</Badge>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="space-y-3">
        <h3 className="text-lg font-semibold text-text">{t("users.history")}</h3>
        {user.history.length === 0 ? (
          <p className="text-sm text-muted">{t("users.noHistory")}</p>
        ) : (
          <ul className="space-y-2 text-sm">
            {user.history.map((h, i) => (
              <li key={i} className="rounded-md border border-border bg-surface px-4 py-3">
                <span className="font-mono text-xs text-accent">{h.action}</span>
                <span className="text-muted"> · {date(h.createdAt)} · {h.actorUsername ? `@${h.actorUsername}` : t("audit.system")}</span>
                {typeof h.details.reason === "string" && <p className="mt-1 text-text">{h.details.reason}</p>}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function Item({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs text-muted">{label}</dt>
      <dd className="mt-1 break-all text-text">{value}</dd>
    </div>
  );
}

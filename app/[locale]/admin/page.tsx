import { getTranslations } from "next-intl/server";
import { Suspense } from "react";

import { AdminHeading, LoadError, MfaRequired } from "@/components/admin/admin-shell";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Link } from "@/i18n/navigation";
import { requireAdmin } from "@/lib/admin/guard";
import { getAdminOverview, type AdminOverview } from "@/lib/admin/queries";

export default function AdminOverviewPage() {
  return (
    <Suspense fallback={<Skeleton className="h-64 w-full" />}>
      <Overview />
    </Suspense>
  );
}

async function Overview() {
  const { mfaReady } = await requireAdmin("/admin");
  if (!mfaReady) return <MfaRequired />;
  const [t, data] = await Promise.all([getTranslations("Admin"), getAdminOverview()]);
  if (!data) return <LoadError />;

  const cards: { key: keyof AdminOverview; href?: string; highlight?: boolean }[] = [
    { key: "pendingIdeas", href: "/admin/moderation", highlight: data.pendingIdeas > 0 },
    { key: "openReports", href: "/admin/reports", highlight: data.openReports > 0 },
    { key: "ageChecks", href: "/admin/users?filter=age_check" },
    { key: "approvedIdeas" },
    { key: "users", href: "/admin/users" },
    { key: "newUsers7d" },
    { key: "blockedUsers", href: "/admin/users?filter=blocked" },
  ];

  return (
    <>
      <AdminHeading title={t("nav.overview")} />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {cards.map(({ key, href, highlight }) => {
          const body = (
            <Card interactive={Boolean(href)} className="h-full p-5">
              <p className="text-xs text-muted">{t(`overview.${key}`)}</p>
              <p className={`tabular mt-2 text-3xl font-semibold ${highlight ? "text-accent" : "text-text"}`}>{data[key]}</p>
            </Card>
          );
          return href ? (
            <Link key={key} href={href} className="block">
              {body}
            </Link>
          ) : (
            <div key={key}>{body}</div>
          );
        })}
      </div>
    </>
  );
}

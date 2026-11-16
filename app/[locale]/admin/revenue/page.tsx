import { getTranslations } from "next-intl/server";
import { Suspense } from "react";

import { AdminHeading, LoadError, MfaRequired } from "@/components/admin/admin-shell";
import { Alert } from "@/components/ui/alert";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { requireAdmin } from "@/lib/admin/guard";
import { getAdminCreditStats } from "@/lib/admin/queries";

export default function RevenuePage() {
  return (
    <Suspense fallback={<Skeleton className="h-96 w-full" />}>
      <Revenue />
    </Suspense>
  );
}

async function Revenue() {
  const { mfaReady } = await requireAdmin("/admin/revenue");
  if (!mfaReady) return <MfaRequired />;
  const [t, tWallet, stats] = await Promise.all([getTranslations("Admin.revenue"), getTranslations("Wallet"), getAdminCreditStats(30)]);
  if (!stats) return <LoadError />;
  const held = stats.inCirculation.subscription + stats.inCirculation.purchased + stats.inCirculation.earned;

  return (
    <>
      <AdminHeading title={t("title")} subtitle={t("subtitle")} />
      <div className="grid gap-4 sm:grid-cols-3">
        {[
          { label: t("inCirculation"), value: held },
          { label: t("unlocks"), value: stats.unlocks },
          { label: t("featured"), value: stats.featured },
        ].map((c) => (
          <Card key={c.label} className="p-5">
            <p className="text-xs text-muted">{c.label}</p>
            <p className="tabular mt-2 text-3xl font-semibold text-text">{c.value}</p>
          </Card>
        ))}
      </div>
      <div className="overflow-x-auto rounded-lg border border-border">
        <table className="w-full text-left text-sm">
          <thead className="bg-surface-2 text-xs text-muted">
            <tr>
              <th scope="col" className="px-4 py-3 font-medium">{t("reason")}</th>
              <th scope="col" className="px-4 py-3 text-right font-medium">{t("granted")}</th>
              <th scope="col" className="px-4 py-3 text-right font-medium">{t("spent")}</th>
              <th scope="col" className="px-4 py-3 text-right font-medium">{t("count")}</th>
            </tr>
          </thead>
          <tbody className="tabular divide-y divide-border bg-surface">
            {stats.byReason.map((r) => (
              <tr key={r.reason}>
                <td className="px-4 py-3 text-text">
                  {tWallet.has(`reasons.${r.reason}` as never) ? tWallet(`reasons.${r.reason}` as never) : r.reason}
                </td>
                <td className="px-4 py-3 text-right text-success">{r.granted || "—"}</td>
                <td className="px-4 py-3 text-right text-text">{r.spent || "—"}</td>
                <td className="px-4 py-3 text-right text-muted">{r.count}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Alert variant="info">{t("moneySoon")}</Alert>
    </>
  );
}

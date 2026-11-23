import { Coins } from "lucide-react";
import type { Metadata } from "next";
import { getFormatter, getTranslations } from "next-intl/server";
import { Suspense } from "react";

import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Container } from "@/components/ui/container";
import { Skeleton } from "@/components/ui/skeleton";
import { Link } from "@/i18n/navigation";
import { requireAccount } from "@/lib/auth/account";
import { CheckoutButton } from "@/components/billing/checkout-button";
import { isCheckoutEnabled } from "@/lib/billing/polar";
import { getBilling, refreshMyCredits } from "@/lib/billing/queries";
import { WALLET_PAGE_SIZE, getWallet } from "@/lib/credits/queries";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("Pages");
  return { title: t("wallet"), robots: { index: false } };
}

const ACTIONS = ["unlock_idea", "first_message", "job_apply", "extra_post", "feature_post"] as const;

export default function WalletPage({ searchParams }: PageProps<"/[locale]/wallet">) {
  return (
    <Container className="py-12 md:py-16">
      <Suspense fallback={<Skeleton className="h-96 w-full" />}>
        <WalletContent searchParams={searchParams} />
      </Suspense>
    </Container>
  );
}

async function WalletContent({ searchParams }: { searchParams: PageProps<"/[locale]/wallet">["searchParams"] }) {
  await requireAccount({ next: "/wallet" });
  const params = await searchParams;
  const pageNum = Number(typeof params.page === "string" ? params.page : "1");
  const page = Number.isInteger(pageNum) && pageNum >= 1 ? pageNum : 1;
  await refreshMyCredits();
  const [t, format, wallet, billing] = await Promise.all([getTranslations("Wallet"), getFormatter(), getWallet(page), getBilling()]);
  const enabled = isCheckoutEnabled();
  const justPaid = params.checkout === "success";
  const sub = billing?.subscription ?? null;
  const date = (iso: string | null) => (iso ? format.dateTime(new Date(iso), { dateStyle: "medium" }) : "");

  if (!wallet) return <Alert variant="danger">{(await getTranslations("Errors"))("unexpected")}</Alert>;
  const pageCount = Math.max(1, Math.ceil(wallet.transactionsTotal / WALLET_PAGE_SIZE));

  return (
    <div className="space-y-10">
      <div>
        <h1 className="text-3xl font-bold text-text md:text-4xl">{t("title")}</h1>
        <p className="mt-3 text-muted">{t("subtitle")}</p>
      </div>

      {justPaid && (
        <Alert variant="success">
          <strong className="font-semibold">{t("paidTitle")}.</strong> {t("paidBody")}
        </Alert>
      )}

      <div className="grid gap-5 lg:grid-cols-[1.3fr_1fr]">
        <Card className="space-y-6 p-6">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <p className="text-sm text-muted">{t("balance")}</p>
              <p className="tabular mt-1 flex items-center gap-3 text-5xl font-bold text-text">
                <Coins className="size-9 text-accent" aria-hidden />
                {wallet.total.toLocaleString("en-US")}
              </p>
            </div>
            {enabled ? (
              <Button asChild>
                <Link href="/pricing#credits">{t("buy")}</Link>
              </Button>
            ) : (
              <div className="text-right">
                <Button disabled>{t("buy")}</Button>
                <p className="mt-1 text-xs text-muted">{t("buySoon")}</p>
              </div>
            )}
          </div>
          <dl className="grid gap-3 sm:grid-cols-3">
            {(["subscription", "purchased", "earned"] as const).map((b) => (
              <div key={b} className="rounded-md border border-border bg-surface-2 p-3">
                <dt className="text-xs text-muted">{t(`buckets.${b}`)}</dt>
                <dd className="tabular mt-1 text-lg font-semibold text-text">{wallet.balances[b]}</dd>
              </div>
            ))}
          </dl>
          <p className="text-xs text-muted">{t("bucketsHint")}</p>
        </Card>

        <Card className="space-y-5 p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-muted">{t("plan")}</p>
              <p className="mt-1 text-xl font-semibold text-text">{t(`planName.${wallet.plan}`)}</p>
            </div>
            <Link href="/pricing" className="text-sm text-accent hover:underline">{t("comparePlans")}</Link>
          </div>
          {sub && (
            <div className="space-y-1 text-sm">
              <p className="text-text">
                {t(`interval.${sub.interval}`)}
                {" · "}
                {sub.status === "trialing"
                  ? t("trialEnds", { date: date(sub.trialEnd) })
                  : sub.cancelAtPeriodEnd
                    ? t("endsOn", { date: date(sub.currentPeriodEnd) })
                    : sub.status === "past_due"
                      ? t("pastDue")
                      : t("renewsOn", { date: date(sub.currentPeriodEnd) })}
              </p>
            </div>
          )}
          {enabled && billing?.hasCustomer && (
            <CheckoutButton product="portal" variant="secondary" size="sm">
              {t("manageBilling")}
            </CheckoutButton>
          )}
          {billing?.hasCustomer && <p className="text-xs text-muted">{t("billingHelp")}</p>}
          <div className="space-y-1 text-sm">
            <p className="font-medium text-text">{t("posts")}</p>
            {wallet.posts.freePosts === null ? (
              <p className="text-muted">{t("postsUnlimited")}</p>
            ) : (
              <>
                <p className="text-muted">{t("postsUsed", { used: wallet.posts.used, total: wallet.posts.freePosts, reset: wallet.posts.reset })}</p>
                <p className="text-muted">{t("postsNext", { cost: wallet.posts.nextCost })}</p>
              </>
            )}
          </div>
          <div className="space-y-1 text-sm">
            <p className="font-medium text-text">{t("featured")}</p>
            <p className="text-muted">{t("featuredQuota", { quota: wallet.featured.quota })}</p>
            <p className="text-muted">{t("featuredNext", { cost: wallet.featured.nextCost })}</p>
          </div>
        </Card>
      </div>

      <section className="space-y-4">
        <h2 className="text-lg font-semibold text-text">{t("prices")}</h2>
        <ul className="divide-y divide-border rounded-lg border border-border bg-surface">
          {ACTIONS.map((a) => (
            <li key={a} className="flex items-center justify-between gap-4 px-4 py-3 text-sm">
              <span className="text-text">{t(`actions.${a}`)}</span>
              <span className="tabular font-medium text-accent">{t("credits", { count: wallet.prices[a] ?? 0 })}</span>
            </li>
          ))}
        </ul>
        <p className="text-xs text-muted">{t("creatorShare")}</p>
      </section>

      <section className="space-y-4">
        <h2 className="text-lg font-semibold text-text">{t("history")}</h2>
        {wallet.transactions.length === 0 ? (
          <p className="rounded-lg border border-dashed border-border p-8 text-center text-sm text-muted">{t("historyEmpty")}</p>
        ) : (
          <ul className="divide-y divide-border rounded-lg border border-border bg-surface">
            {wallet.transactions.map((tx) => (
              <li key={tx.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 text-sm">
                <div className="min-w-0">
                  <p className="text-text">
                    {t(`reasons.${tx.reason}`)}
                    {tx.relatedTitle && (
                      <>
                        {" · "}
                        {tx.relatedSlug ? (
                          <Link href={`/ideas/${tx.relatedSlug}`} className="text-accent hover:underline">{tx.relatedTitle}</Link>
                        ) : (
                          <span className="text-muted">{tx.relatedTitle}</span>
                        )}
                      </>
                    )}
                  </p>
                  <p className="text-xs text-muted">
                    {format.dateTime(new Date(tx.createdAt), { dateStyle: "medium", timeStyle: "short" })}
                    {" · "}
                    {t(`buckets.${tx.bucket}`)}
                    {tx.note ? ` · ${tx.note}` : ""}
                  </p>
                </div>
                <div className="text-right">
                  <Badge variant={tx.delta > 0 ? "success" : "neutral"} className="tabular">
                    {tx.delta > 0 ? `+${tx.delta}` : tx.delta}
                  </Badge>
                  <p className="tabular mt-1 text-xs text-muted">{t("balanceAfter", { balance: tx.balanceAfter })}</p>
                </div>
              </li>
            ))}
          </ul>
        )}
        {pageCount > 1 && (
          <nav aria-label="Pagination" className="flex items-center justify-between gap-4">
            {page > 1 ? (
              <Button asChild variant="secondary" size="sm"><Link href={page === 2 ? "/wallet" : `/wallet?page=${page - 1}`}>{t("prev")}</Link></Button>
            ) : (
              <Button variant="secondary" size="sm" disabled>{t("prev")}</Button>
            )}
            <span className="tabular text-sm text-muted">{t("pageOf", { page, total: pageCount })}</span>
            {page < pageCount ? (
              <Button asChild variant="secondary" size="sm"><Link href={`/wallet?page=${page + 1}`}>{t("next")}</Link></Button>
            ) : (
              <Button variant="secondary" size="sm" disabled>{t("next")}</Button>
            )}
          </nav>
        )}
      </section>
    </div>
  );
}

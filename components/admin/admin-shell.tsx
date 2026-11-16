import { getTranslations } from "next-intl/server";
import type { ReactNode } from "react";

import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";
import { getAccount } from "@/lib/auth/account";

import { EmailCodeGate } from "./email-code-gate";

/** Page heading used by every admin screen. */
export function AdminHeading({ title, subtitle, children }: { title: string; subtitle?: string; children?: ReactNode }) {
  return (
    <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
      <div>
        <h2 className="text-2xl font-bold text-text">{title}</h2>
        {subtitle && <p className="mt-2 text-sm text-muted">{subtitle}</p>}
      </div>
      {children}
    </div>
  );
}

/** Shown to an admin whose login hasn't been confirmed with an email code yet. */
export async function MfaRequired() {
  const account = await getAccount();
  const email = account?.email ?? "";
  const [name, domain] = email.split("@");
  const masked = name && domain ? `${name.slice(0, 2)}${"•".repeat(Math.max(1, name.length - 2))}@${domain}` : email;
  return <EmailCodeGate maskedEmail={masked} />;
}

export async function LoadError() {
  const t = await getTranslations("Admin");
  return <Alert variant="danger">{t("loadError")}</Alert>;
}

export async function EmptyState() {
  const t = await getTranslations("Admin");
  return <p className="rounded-lg border border-dashed border-border p-10 text-center text-sm text-muted">{t("empty")}</p>;
}

/** Tabs as links, so the chosen tab lives in the URL. */
export function TabLinks({ tabs, active }: { tabs: { href: string; label: string; value: string }[]; active: string }) {
  return (
    <div role="tablist" className="flex flex-wrap gap-2">
      {tabs.map((tab) => (
        <Link
          key={tab.value}
          href={tab.href}
          role="tab"
          aria-selected={tab.value === active}
          className={
            tab.value === active
              ? "rounded-full border border-accent bg-accent/10 px-3.5 py-1.5 text-sm font-medium text-text"
              : "rounded-full border border-border px-3.5 py-1.5 text-sm text-muted transition-colors hover:border-accent/40 hover:text-text"
          }
        >
          {tab.label}
        </Link>
      ))}
    </div>
  );
}

/** Previous / next links; `hrefFor` builds the URL for a page number. */
export async function Pager({ page, total, pageSize, hrefFor }: { page: number; total: number; pageSize: number; hrefFor: (page: number) => string }) {
  const t = await getTranslations("Admin");
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  if (pageCount <= 1) return null;
  return (
    <nav aria-label="Pagination" className="flex items-center justify-between gap-4 pt-4">
      {page > 1 ? (
        <Button asChild variant="secondary" size="sm">
          <Link href={hrefFor(page - 1)}>{t("prev")}</Link>
        </Button>
      ) : (
        <Button variant="secondary" size="sm" disabled>{t("prev")}</Button>
      )}
      <span className="tabular text-sm text-muted">{t("pageOf", { page, total: pageCount })}</span>
      {page < pageCount ? (
        <Button asChild variant="secondary" size="sm">
          <Link href={hrefFor(page + 1)}>{t("next")}</Link>
        </Button>
      ) : (
        <Button variant="secondary" size="sm" disabled>{t("next")}</Button>
      )}
    </nav>
  );
}

/** Reads ?page= safely. */
export function pageParam(value: string | string[] | undefined): number {
  const n = Number(typeof value === "string" ? value : "1");
  return Number.isInteger(n) && n >= 1 && n <= 10000 ? n : 1;
}

/** Builds "/path?a=1&b=2", skipping empty values. */
export function withQuery(path: string, params: Record<string, string | number | undefined>): string {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === "" || (k === "page" && v === 1)) continue;
    q.set(k, String(v));
  }
  const s = q.toString();
  return s ? `${path}?${s}` : path;
}

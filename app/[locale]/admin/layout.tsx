import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { Suspense } from "react";

import { AdminNav, AdminNavStatic } from "@/components/admin/admin-nav";
import { Container } from "@/components/ui/container";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("Pages");
  return { title: t("admin"), robots: { index: false, follow: false } };
}

// The shell holds no data. Each page checks admin role and 2FA itself (and the database checks again).
export default async function AdminLayout({ children }: LayoutProps<"/[locale]/admin">) {
  const t = await getTranslations("Admin");
  return (
    <Container className="py-12 md:py-16">
      <h1 className="text-3xl font-bold text-text md:text-4xl">{t("title")}</h1>
      <div className="mt-8 grid gap-8 md:grid-cols-[200px_1fr] md:gap-12">
        <aside className="md:sticky md:top-24 md:self-start">
          <Suspense fallback={<AdminNavStatic />}>
            <AdminNav />
          </Suspense>
        </aside>
        <div className="min-w-0 space-y-6">{children}</div>
      </div>
    </Container>
  );
}

import { getTranslations } from "next-intl/server";
import { Suspense } from "react";

import { AdminHeading, LoadError, MfaRequired } from "@/components/admin/admin-shell";
import { TaxonomyEditor } from "@/components/admin/taxonomy-editor";
import { Skeleton } from "@/components/ui/skeleton";
import { requireAdmin } from "@/lib/admin/guard";
import { getAdminTaxonomy } from "@/lib/admin/queries";

export default function CategoriesPage() {
  return (
    <Suspense fallback={<Skeleton className="h-96 w-full" />}>
      <Categories />
    </Suspense>
  );
}

async function Categories() {
  const { mfaReady } = await requireAdmin("/admin/categories");
  if (!mfaReady) return <MfaRequired />;
  const [t, data] = await Promise.all([getTranslations("Admin.taxonomy"), getAdminTaxonomy()]);
  if (!data) return <LoadError />;

  return (
    <>
      <AdminHeading title={t("title")} subtitle={t("subtitle")} />
      <section className="space-y-3">
        <h3 className="text-lg font-semibold text-text">{t("categories")}</h3>
        <TaxonomyEditor
          kind="category"
          rows={data.categories.map((c) => ({
            id: c.id, name: c.name, slug: c.slug, sortOrder: c.sortOrder,
            usage: t("usageCategory", { ideas: c.ideas }), inUse: c.ideas > 0,
          }))}
        />
      </section>
      <section className="space-y-3 pt-4">
        <h3 className="text-lg font-semibold text-text">{t("skills")}</h3>
        <TaxonomyEditor
          kind="skill"
          rows={data.skills.map((s) => ({
            id: s.id, name: s.name, slug: s.slug,
            usage: t("usageSkill", { ideas: s.ideas, profiles: s.profiles }), inUse: s.ideas + s.profiles > 0,
          }))}
        />
      </section>
    </>
  );
}

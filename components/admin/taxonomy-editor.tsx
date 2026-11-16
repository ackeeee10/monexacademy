"use client";

import { Pencil, Plus, Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";

import { runAction } from "@/components/auth/run-action";
import { useErrorMessage } from "@/components/auth/use-error";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useRouter } from "@/i18n/navigation";
import { deleteCategoryAction, deleteSkillAction, saveCategoryAction, saveSkillAction } from "@/lib/admin/actions";
import type { ActionResult } from "@/lib/auth/types";

type Row = { id: string; name: string; slug: string; sortOrder?: number; usage: string; inUse: boolean };
type Draft = { id: string | null; name: string; slug: string; sortOrder: string };

const toSlug = (name: string) =>
  name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60);

/** Inline list editor for categories (with order) or skills. */
export function TaxonomyEditor({ kind, rows }: { kind: "category" | "skill"; rows: Row[] }) {
  const t = useTranslations("Admin.taxonomy");
  const tAdmin = useTranslations("Admin");
  const errorMessage = useErrorMessage();
  const router = useRouter();
  const [draft, setDraft] = useState<Draft | null>(null);
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const withOrder = kind === "category";

  const finish = (result: ActionResult) => {
    if (!result.ok) {
      const field = result.fields ? Object.values(result.fields)[0] : undefined;
      setError(errorMessage(field ?? result.error) ?? null);
      return false;
    }
    setError(null);
    router.refresh();
    return true;
  };

  const save = () => {
    if (!draft) return;
    startTransition(async () => {
      const result = await runAction(() =>
        withOrder
          ? saveCategoryAction({ id: draft.id, name: draft.name, slug: draft.slug, sortOrder: Number(draft.sortOrder) || 0 })
          : saveSkillAction({ id: draft.id, name: draft.name, slug: draft.slug }),
      );
      if (finish(result)) setDraft(null);
    });
  };

  const remove = (id: string) => {
    startTransition(async () => {
      const result = await runAction(() => (withOrder ? deleteCategoryAction(id) : deleteSkillAction(id)));
      finish(result);
      setConfirmId(null);
    });
  };

  const editor = draft && (
    <div className="grid gap-2 rounded-md border border-accent/40 bg-surface-2 p-3 sm:grid-cols-[1fr_1fr_auto_auto] sm:items-center">
      <Input
        aria-label={t("name")}
        placeholder={t("name")}
        value={draft.name}
        maxLength={60}
        onChange={(e) => {
          const name = e.target.value;
          // Suggest a slug for new items until the slug is edited by hand.
          setDraft((d) => d && { ...d, name, slug: d.id === null && d.slug === toSlug(d.name) ? toSlug(name) : d.slug });
        }}
      />
      <Input aria-label={t("slug")} placeholder={t("slug")} value={draft.slug} maxLength={60} onChange={(e) => setDraft((d) => d && { ...d, slug: e.target.value })} />
      {withOrder ? (
        <Input aria-label={t("sortOrder")} type="number" min={0} className="sm:w-24" value={draft.sortOrder} onChange={(e) => setDraft((d) => d && { ...d, sortOrder: e.target.value })} />
      ) : (
        <span className="hidden sm:block" />
      )}
      <div className="flex gap-2">
        <Button type="button" size="sm" disabled={pending} onClick={save}>{pending ? tAdmin("saving") : tAdmin("save")}</Button>
        <Button type="button" size="sm" variant="ghost" disabled={pending} onClick={() => setDraft(null)}>{tAdmin("cancel")}</Button>
      </div>
    </div>
  );

  return (
    <div className="space-y-3">
      {error && <Alert variant="danger">{error}</Alert>}
      {draft?.id === null ? editor : (
        <Button type="button" variant="secondary" size="sm" onClick={() => setDraft({ id: null, name: "", slug: "", sortOrder: String((rows.at(-1)?.sortOrder ?? 0) + 10) })}>
          <Plus aria-hidden />
          {kind === "category" ? t("newCategory") : t("newSkill")}
        </Button>
      )}
      <ul className="divide-y divide-border rounded-lg border border-border bg-surface">
        {rows.map((row) => (
          <li key={row.id} className="px-4 py-3">
            {draft?.id === row.id ? editor : (
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-text">
                    {withOrder && <span className="tabular mr-2 text-muted">{row.sortOrder}</span>}
                    {row.name}
                  </p>
                  <p className="text-xs text-muted">{row.slug} · {row.usage}</p>
                </div>
                <div className="flex items-center gap-1">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => setDraft({ id: row.id, name: row.name, slug: row.slug, sortOrder: String(row.sortOrder ?? 0) })}
                  >
                    <Pencil aria-hidden />
                    {t("edit")}
                  </Button>
                  {!row.inUse && (
                    confirmId === row.id ? (
                      <Button type="button" size="sm" variant="secondary" className="border-danger/50 text-danger" disabled={pending} onClick={() => remove(row.id)}>
                        {t("confirmDelete")}
                      </Button>
                    ) : (
                      <Button type="button" variant="ghost" size="sm" onClick={() => setConfirmId(row.id)}>
                        <Trash2 aria-hidden />
                        {t("delete")}
                      </Button>
                    )
                  )}
                </div>
              </div>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

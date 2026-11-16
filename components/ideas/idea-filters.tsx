import { Search, SlidersHorizontal } from "lucide-react";
import { getTranslations } from "next-intl/server";
import type { ReactNode } from "react";

import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { Select } from "@/components/ui/field";
import { Link } from "@/i18n/navigation";
import type { CategoryOption } from "@/lib/ideas/queries";
import { BUDGETS, TEAM_MODES, WORK_PREFERENCES } from "@/lib/validation/profile";
import { DIFFICULTIES, IDEA_SORTS, TIME_TO_INCOME, type IdeaFilters } from "@/lib/validation/idea";

/**
 * Filter bar as a plain GET form: every choice lives in the URL, so a filtered
 * list can be bookmarked or shared, and it works without JavaScript.
 */
export async function IdeaFilterBar({
  current,
  categories,
}: {
  current: IdeaFilters;
  categories: CategoryOption[];
}) {
  const t = await getTranslations("Ideas");
  const tOpt = await getTranslations("Options");
  const anyOption = t("any");

  return (
    <form method="get" role="search" className="grid gap-4 rounded-lg border border-border bg-surface p-5 md:grid-cols-2 xl:grid-cols-4">
      <div className="md:col-span-2 xl:col-span-4">
        <Label htmlFor="ideas-q" className="sr-only">
          {t("search")}
        </Label>
        <div className="relative">
          <Search className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-muted" aria-hidden />
          <Input
            id="ideas-q"
            name="q"
            type="search"
            defaultValue={current.q ?? ""}
            placeholder={t("searchPlaceholder")}
            maxLength={100}
            className="h-11 pl-10"
          />
        </div>
      </div>

      <FilterSelect id="budget" name="budget" label={t("filter.budget")} value={current.budget} anyLabel={anyOption}>
        {BUDGETS.map((b) => (
          <option key={b} value={b}>{tOpt(`budget.${b}`)}</option>
        ))}
      </FilterSelect>

      <FilterSelect id="category" name="category" label={t("filter.category")} value={current.category} anyLabel={anyOption}>
        {categories.map((c) => (
          <option key={c.slug} value={c.slug}>{c.name}</option>
        ))}
      </FilterSelect>

      <FilterSelect id="difficulty" name="difficulty" label={t("filter.difficulty")} value={current.difficulty} anyLabel={anyOption}>
        {DIFFICULTIES.map((d) => (
          <option key={d} value={d}>{tOpt(`difficulty.${d}`)}</option>
        ))}
      </FilterSelect>

      <FilterSelect id="time" name="time" label={t("filter.time")} value={current.time} anyLabel={anyOption}>
        {TIME_TO_INCOME.map((x) => (
          <option key={x} value={x}>{tOpt(`timeToIncome.${x}`)}</option>
        ))}
      </FilterSelect>

      <FilterSelect id="mode" name="mode" label={t("filter.mode")} value={current.mode} anyLabel={anyOption}>
        {WORK_PREFERENCES.map((m) => (
          <option key={m} value={m}>{t(`modeLabels.${m}`)}</option>
        ))}
      </FilterSelect>

      <FilterSelect id="team" name="team" label={t("filter.team")} value={current.team} anyLabel={anyOption}>
        {TEAM_MODES.map((m) => (
          <option key={m} value={m}>{t(`teamLabels.${m}`)}</option>
        ))}
      </FilterSelect>

      <FilterSelect id="minEarning" name="minEarning" label={t("filter.minEarning")} value={current.minEarning} anyLabel={anyOption}>
        {(["500", "1000", "3000"] as const).map((v) => (
          <option key={v} value={v}>${Number(v).toLocaleString("en-US")}</option>
        ))}
      </FilterSelect>

      <FilterSelect id="sort" name="sort" label={t("filter.sort")} value={current.sort} anyLabel={undefined}>
        {IDEA_SORTS.map((s) => (
          <option key={s} value={s}>{tOpt(`sort.${s}`)}</option>
        ))}
      </FilterSelect>

      <div className="flex flex-wrap items-center justify-end gap-3 md:col-span-2 xl:col-span-4">
        <Button asChild variant="ghost" size="sm">
          <Link href="/ideas">{t("reset")}</Link>
        </Button>
        <Button type="submit">
          <SlidersHorizontal aria-hidden />
          {t("apply")}
        </Button>
      </div>
    </form>
  );
}

function FilterSelect({
  id,
  name,
  label,
  value,
  anyLabel,
  children,
}: {
  id: string;
  name: string;
  label: string;
  value: string | undefined;
  anyLabel: string | undefined;
  children: ReactNode;
}) {
  return (
    <div className="space-y-2">
      <Label htmlFor={`ideas-${id}`}>{label}</Label>
      <Select id={`ideas-${id}`} name={name} defaultValue={value ?? ""} className="h-11">
        {anyLabel !== undefined && <option value="">{anyLabel}</option>}
        {children}
      </Select>
    </div>
  );
}

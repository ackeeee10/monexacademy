import { Bookmark, Clock, Gauge, Users, MapPin } from "lucide-react";
import { getTranslations } from "next-intl/server";

import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Link } from "@/i18n/navigation";
import { formatUsd } from "@/lib/ideas/format";
import type { IdeaSummary } from "@/lib/ideas/queries";

/** One idea in the browse list. Public fields only; the full plan stays locked. */
export async function IdeaCard({ idea }: { idea: IdeaSummary }) {
  const t = await getTranslations("Ideas");
  const tOpt = await getTranslations("Options");

  return (
    <Link href={`/ideas/${idea.slug}`} className="group block h-full">
      <Card interactive className="flex h-full flex-col gap-4 p-6">
        <div className="flex flex-wrap items-center gap-2">
          {idea.isMonexOriginal && <Badge variant="accent">{t("monexOriginal")}</Badge>}
          {idea.isFeatured && <Badge variant="accent">{t("featured")}</Badge>}
          <span className="text-xs text-muted">{idea.categoryName}</span>
        </div>

        <div className="space-y-2">
          <h2 className="text-lg font-semibold leading-snug text-text group-hover:text-accent">{idea.title}</h2>
          <p className="line-clamp-3 text-sm leading-relaxed text-muted">{idea.shortDescription}</p>
        </div>

        <dl className="mt-auto grid grid-cols-2 gap-x-4 gap-y-3 border-t border-border pt-4 text-sm">
          <div>
            <dt className="text-xs text-muted">{t("labels.investment")}</dt>
            <dd className="tabular font-medium text-text">{tOpt(`budget.${idea.investmentRange}`)}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted">{t("labels.earnings")}</dt>
            <dd className="tabular font-medium text-accent">
              {t("earningPerMonth", { min: formatUsd(idea.earningMin), max: formatUsd(idea.earningMax) })}
            </dd>
          </div>
          <div className="flex items-center gap-1.5 text-muted">
            <Gauge className="size-3.5" aria-hidden />
            <span>{tOpt(`difficulty.${idea.difficulty}`)}</span>
          </div>
          <div className="flex items-center gap-1.5 text-muted">
            <Clock className="size-3.5" aria-hidden />
            <span>{tOpt(`timeToIncome.${idea.timeToFirstIncome}`)}</span>
          </div>
          <div className="flex items-center gap-1.5 text-muted">
            <MapPin className="size-3.5" aria-hidden />
            <span>{t(`modeLabels.${idea.workMode}`)}</span>
          </div>
          <div className="flex items-center gap-1.5 text-muted">
            <Users className="size-3.5" aria-hidden />
            <span>{t(`teamLabels.${idea.teamMode}`)}</span>
          </div>
        </dl>

        <div className="flex items-center justify-between text-xs text-muted">
          <span>{idea.isMonexOriginal ? t("byMonex") : t("byAuthor", { name: idea.authorUsername ? `@${idea.authorUsername}` : "—" })}</span>
          <span className="inline-flex items-center gap-1">
            <Bookmark className="size-3.5" aria-hidden />
            {t("saves", { count: idea.savesCount })}
          </span>
        </div>
      </Card>
    </Link>
  );
}

import { Clock, Gauge, MapPin, Users, Wallet, TrendingUp } from "lucide-react";
import { getTranslations } from "next-intl/server";

import { Card } from "@/components/ui/card";
import { formatUsd } from "@/lib/ideas/format";
import type { IdeaSummary } from "@/lib/ideas/queries";

/** The key numbers of an idea, shown as a grid of cards. */
export async function IdeaFacts({ idea }: { idea: IdeaSummary }) {
  const t = await getTranslations("Ideas");
  const tOpt = await getTranslations("Options");

  const facts = [
    { Icon: Wallet, label: t("labels.investment"), value: tOpt(`budget.${idea.investmentRange}`) },
    {
      Icon: TrendingUp,
      label: t("labels.earnings"),
      value: t("earningPerMonth", { min: formatUsd(idea.earningMin), max: formatUsd(idea.earningMax) }),
      accent: true,
    },
    { Icon: Gauge, label: t("labels.difficulty"), value: tOpt(`difficulty.${idea.difficulty}`) },
    { Icon: Clock, label: t("labels.time"), value: tOpt(`timeToIncome.${idea.timeToFirstIncome}`) },
    { Icon: MapPin, label: t("labels.where"), value: t(`modeLabels.${idea.workMode}`) },
    { Icon: Users, label: t("labels.who"), value: t(`teamLabels.${idea.teamMode}`) },
  ];

  return (
    <dl className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {facts.map(({ Icon, label, value, accent }) => (
        <Card key={label} className="p-5">
          <dt className="flex items-center gap-2 text-xs text-muted">
            <Icon className="size-3.5" aria-hidden />
            {label}
          </dt>
          <dd className={`tabular mt-2 text-lg font-semibold ${accent ? "text-accent" : "text-text"}`}>{value}</dd>
        </Card>
      ))}
    </dl>
  );
}

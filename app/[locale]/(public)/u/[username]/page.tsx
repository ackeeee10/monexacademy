import { CalendarDays, Clock, ExternalLink, MapPin, PencilLine, Star } from "lucide-react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getFormatter, getLocale, getTranslations } from "next-intl/server";
import { Suspense } from "react";

import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Container } from "@/components/ui/container";
import { Skeleton } from "@/components/ui/skeleton";
import { Link } from "@/i18n/navigation";
import { getPublicProfile, type PublicProfile } from "@/lib/account/queries";
import { getUserId } from "@/lib/auth/account";
import { countryName } from "@/lib/countries";
import { USERNAME_PATTERN } from "@/lib/validation/shared";

type Props = PageProps<"/[locale]/u/[username]">;

async function loadProfile(params: Props["params"]): Promise<PublicProfile | null> {
  const { username } = await params;
  const normalized = decodeURIComponent(username).toLowerCase();
  if (!USERNAME_PATTERN.test(normalized)) return null;
  return getPublicProfile(normalized);
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const profile = await loadProfile(params);
  if (!profile) return { title: "404", robots: { index: false } };
  return {
    title: `@${profile.username}`,
    description: profile.bio?.slice(0, 160) ?? undefined,
    openGraph: { type: "profile", title: `@${profile.username} · MONEX Academy` },
    alternates: { canonical: `/u/${profile.username}` },
  };
}

export default function PublicProfilePage({ params }: Props) {
  return (
    <Container className="py-12 md:py-16">
      <Suspense fallback={<ProfileSkeleton />}>
        <Profile params={params} />
      </Suspense>
    </Container>
  );
}

async function Profile({ params }: { params: Props["params"] }) {
  const profile = await loadProfile(params);
  if (!profile) notFound();

  const [t, tOpt, format, locale] = await Promise.all([
    getTranslations("Profile"),
    getTranslations("Options"),
    getFormatter(),
    getLocale(),
  ]);
  const location = [profile.city, profile.country ? countryName(profile.country, locale) : null].filter(Boolean).join(", ");
  const isEmpty = !profile.bio && !profile.experience && profile.skills.length === 0 && profile.links.length === 0;

  return (
    <div className="grid gap-8 lg:grid-cols-[1fr_320px]">
      <div className="min-w-0 space-y-6">
        <header className="animate-rise rounded-xl border border-border bg-surface p-6 sm:p-8">
          <div className="flex flex-col gap-6 sm:flex-row sm:items-center">
            <Avatar name={profile.username} src={profile.avatarUrl} className="size-20 text-xl sm:size-24" />
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-3">
                <h1 className="truncate text-2xl font-bold text-text sm:text-3xl">@{profile.username}</h1>
                {profile.plan !== "free" && (
                  <Badge variant={profile.plan === "elite" ? "accent" : "neutral"}>{t(`plan.${profile.plan}`)}</Badge>
                )}
              </div>
              <ul className="mt-3 flex flex-wrap gap-x-5 gap-y-2 text-sm text-muted">
                {location && (
                  <li className="flex items-center gap-1.5">
                    <MapPin className="size-4" aria-hidden />
                    {location}
                  </li>
                )}
                {profile.availabilityHours != null && (
                  <li className="tabular flex items-center gap-1.5">
                    <Clock className="size-4" aria-hidden />
                    {t("availability", { hours: profile.availabilityHours })}
                  </li>
                )}
                <li className="flex items-center gap-1.5">
                  <CalendarDays className="size-4" aria-hidden />
                  {t("memberSince", { date: format.dateTime(new Date(profile.createdAt), { month: "long", year: "numeric" }) })}
                </li>
              </ul>
            </div>
            <Suspense fallback={null}>
              <OwnerActions profileId={profile.id} />
            </Suspense>
          </div>
          {profile.lookingFor.length > 0 && (
            <div className="mt-6 flex flex-wrap items-center gap-2 border-t border-border pt-5">
              <span className="mr-1 text-xs font-semibold uppercase tracking-[0.16em] text-muted">{t("lookingFor")}</span>
              {profile.lookingFor.map((v) => (
                <Badge key={v} variant="accent">
                  {tOpt(`lookingFor.${v}`)}
                </Badge>
              ))}
            </div>
          )}
        </header>

        {isEmpty && <p className="text-sm text-muted">{t("empty")}</p>}

        {profile.bio && (
          <ProfileSection title={t("about")}>
            <p className="whitespace-pre-line leading-relaxed text-text/90">{profile.bio}</p>
          </ProfileSection>
        )}

        {profile.skills.length > 0 && (
          <ProfileSection title={t("skills")}>
            <ul className="flex flex-wrap gap-2">
              {profile.skills.map((s) => (
                <li key={s} className="rounded-full border border-border bg-surface-2 px-3.5 py-1.5 text-sm text-text">
                  {s}
                </li>
              ))}
            </ul>
          </ProfileSection>
        )}

        {profile.experience && (
          <ProfileSection title={t("experience")}>
            <p className="whitespace-pre-line leading-relaxed text-text/90">{profile.experience}</p>
          </ProfileSection>
        )}

        {profile.portfolio.length > 0 && (
          <ProfileSection title={t("portfolio")}>
            <ul className="grid gap-3 sm:grid-cols-2">
              {profile.portfolio.map((item) => (
                <li key={item.title + item.url} className="rounded-lg border border-border bg-bg p-4">
                  {item.url ? (
                    <a href={item.url} target="_blank" rel="noopener noreferrer nofollow ugc" className="group flex items-center justify-between gap-3 text-text hover:text-accent">
                      <span className="truncate font-medium">{item.title}</span>
                      <ExternalLink className="size-4 shrink-0 text-muted group-hover:text-accent" aria-hidden />
                    </a>
                  ) : (
                    <span className="font-medium text-text">{item.title}</span>
                  )}
                </li>
              ))}
            </ul>
          </ProfileSection>
        )}
      </div>

      <aside className="space-y-6">
        {profile.links.length > 0 && (
          <ProfileSection title={t("links")}>
            <ul className="space-y-2.5">
              {profile.links.map((link) => (
                <li key={link.url}>
                  <a href={link.url} target="_blank" rel="noopener noreferrer nofollow ugc" className="group flex items-center justify-between gap-3 text-sm text-text hover:text-accent">
                    <span className="truncate">{link.label}</span>
                    <ExternalLink className="size-3.5 shrink-0 text-muted group-hover:text-accent" aria-hidden />
                  </a>
                </li>
              ))}
            </ul>
          </ProfileSection>
        )}
        <ProfileSection title={t("reviews")}>
          <div className="flex items-center gap-1 text-border" aria-hidden>
            {Array.from({ length: 5 }, (_, i) => (
              <Star key={i} className="size-4" />
            ))}
          </div>
          <p className="mt-2 text-sm text-muted">{t("noReviews")}</p>
        </ProfileSection>
        <ProfileSection title={t("paidOut")}>
          <p className="tabular font-display text-2xl font-semibold text-text">$0</p>
          <p className="mt-1 text-sm text-muted">{t("paidOutNone")}</p>
        </ProfileSection>
      </aside>
    </div>
  );
}

/** "Edit profile" for the owner only. Reads the session, so it streams separately. */
async function OwnerActions({ profileId }: { profileId: string }) {
  const userId = await getUserId();
  if (userId !== profileId) return null;
  const t = await getTranslations("Profile");
  return (
    <Button asChild variant="secondary" size="sm" className="self-start">
      <Link href="/settings">
        <PencilLine aria-hidden />
        {t("edit")}
      </Link>
    </Button>
  );
}

function ProfileSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-xl border border-border bg-surface p-6">
      <h2 className="mb-4 text-xs font-semibold uppercase tracking-[0.16em] text-muted">{title}</h2>
      {children}
    </section>
  );
}

function ProfileSkeleton() {
  return (
    <div className="grid gap-8 lg:grid-cols-[1fr_320px]">
      <div className="space-y-6">
        <Skeleton className="h-44 rounded-xl" />
        <Skeleton className="h-32 rounded-xl" />
      </div>
      <Skeleton className="h-64 rounded-xl" />
    </div>
  );
}

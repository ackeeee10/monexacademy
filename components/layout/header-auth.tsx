import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Link } from "@/i18n/navigation";
import { getAccount } from "@/lib/auth/account";

import { MobileNav } from "./mobile-nav";
import { ThemeToggle } from "./theme-toggle";
import { UserMenu, type HeaderUser } from "./user-menu";

/** Right side of the header. Reads the session, so it streams in behind Suspense. */
export async function HeaderAuth() {
  const account = await getAccount();
  const user: HeaderUser | null =
    account && !account.deletedAt
      ? { username: account.username, email: account.email, avatarUrl: account.avatarUrl, plan: account.plan }
      : null;

  return (
    <div className="flex items-center justify-end gap-1.5">
      <ThemeToggle className="hidden md:inline-flex" />
      {user ? (
        <div className="hidden md:block">
          <UserMenu user={user} />
        </div>
      ) : (
        <GuestButtons />
      )}
      <MobileNav user={user} />
    </div>
  );
}

function GuestButtons() {
  const t = useTranslations("Nav");
  return (
    <>
      <Button asChild variant="ghost" className="hidden md:inline-flex">
        <Link href="/login">{t("login")}</Link>
      </Button>
      <Button asChild className="hidden md:inline-flex">
        <Link href="/signup">{t("getStarted")}</Link>
      </Button>
    </>
  );
}

export function HeaderAuthFallback() {
  return (
    <div className="flex items-center justify-end gap-1.5">
      <Skeleton className="hidden size-10 md:block" />
      <Skeleton className="hidden h-10 w-48 md:block" />
      <Skeleton className="size-10 md:hidden" />
    </div>
  );
}

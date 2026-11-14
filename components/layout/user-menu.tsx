"use client";

import { LayoutDashboard, LogOut, Settings, UserRound } from "lucide-react";
import { DropdownMenu } from "radix-ui";
import { useTranslations } from "next-intl";
import { useTransition } from "react";

import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Link } from "@/i18n/navigation";
import { signOut } from "@/lib/auth/actions";

export type HeaderUser = {
  username: string | null;
  email: string;
  avatarUrl: string | null;
  plan: "free" | "pro" | "elite";
};

const itemClass =
  "flex cursor-pointer items-center gap-2.5 rounded-md px-2.5 py-2 text-sm text-text outline-none transition-colors data-[highlighted]:bg-surface-2 [&_svg]:size-4 [&_svg]:text-muted";

export function UserMenu({ user }: { user: HeaderUser }) {
  const t = useTranslations("Nav");
  const tProfile = useTranslations("Profile");
  const [signingOut, startSignOut] = useTransition();

  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger
        aria-label={t("account")}
        className="rounded-full outline-none ring-accent/0 transition-shadow focus-visible:ring-2 data-[state=open]:ring-2 data-[state=open]:ring-accent/60"
      >
        <Avatar name={user.username ?? user.email} src={user.avatarUrl} />
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          align="end"
          sideOffset={10}
          className="z-50 w-64 rounded-lg border border-border bg-surface p-1.5 shadow-[0_24px_60px_-24px_rgb(0_0_0/0.5)]"
        >
          <div className="flex items-center gap-3 px-2.5 py-2.5">
            <Avatar name={user.username ?? user.email} src={user.avatarUrl} className="size-10" />
            <div className="min-w-0">
              <p className="flex items-center gap-2 truncate text-sm font-semibold text-text">
                {user.username ? `@${user.username}` : user.email}
                {user.plan !== "free" && <Badge variant="accent">{tProfile(`plan.${user.plan}`)}</Badge>}
              </p>
              <p className="truncate text-xs text-muted">{user.email}</p>
            </div>
          </div>
          <DropdownMenu.Separator className="my-1 h-px bg-border" />
          <DropdownMenu.Item asChild className={itemClass}>
            <Link href="/dashboard">
              <LayoutDashboard aria-hidden />
              {t("dashboard")}
            </Link>
          </DropdownMenu.Item>
          {user.username && (
            <DropdownMenu.Item asChild className={itemClass}>
              <Link href={`/u/${user.username}`}>
                <UserRound aria-hidden />
                {t("profile")}
              </Link>
            </DropdownMenu.Item>
          )}
          <DropdownMenu.Item asChild className={itemClass}>
            <Link href="/settings">
              <Settings aria-hidden />
              {t("settings")}
            </Link>
          </DropdownMenu.Item>
          <DropdownMenu.Separator className="my-1 h-px bg-border" />
          {/* Not a <form>: the menu unmounts on select, before a form could submit. */}
          <DropdownMenu.Item
            className={itemClass}
            disabled={signingOut}
            onSelect={(event) => {
              event.preventDefault();
              startSignOut(() => signOut());
            }}
          >
            <LogOut aria-hidden />
            {t("logout")}
          </DropdownMenu.Item>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}

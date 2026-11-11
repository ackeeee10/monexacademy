import type { ReactNode } from "react";

import { LogoMark } from "@/components/brand/logo";
import { Container } from "@/components/ui/container";

type AuthCardProps = {
  title: ReactNode;
  subtitle?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
};

/** Centered card used by every sign-in related page. */
export function AuthCard({ title, subtitle, children, footer }: AuthCardProps) {
  return (
    <Container className="flex min-h-[calc(100dvh-4rem)] items-start justify-center py-12 sm:items-center sm:py-20">
      <div className="w-full max-w-md animate-rise">
        <div className="rounded-xl border border-border bg-surface p-6 shadow-[0_30px_80px_-40px_rgb(0_0_0/0.45)] sm:p-9">
          <LogoMark className="mb-7 h-9 text-accent" title={null} />
          <h1 className="text-2xl font-bold text-text sm:text-3xl">{title}</h1>
          {subtitle && <p className="mt-2 text-sm leading-relaxed text-muted">{subtitle}</p>}
          <div className="mt-8">{children}</div>
        </div>
        {footer && <div className="mt-6 text-center text-sm text-muted">{footer}</div>}
      </div>
    </Container>
  );
}

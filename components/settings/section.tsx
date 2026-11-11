import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

type SectionProps = {
  title: ReactNode;
  description?: ReactNode;
  children: ReactNode;
  className?: string;
  tone?: "default" | "danger";
};

export function SettingsSection({ title, description, children, className, tone = "default" }: SectionProps) {
  return (
    <section
      className={cn(
        "rounded-xl border bg-surface p-6 sm:p-8",
        tone === "danger" ? "border-danger/40" : "border-border",
        className,
      )}
    >
      <h2 className="text-lg font-semibold text-text">{title}</h2>
      {description && <p className="mt-1.5 max-w-2xl text-sm leading-relaxed text-muted">{description}</p>}
      <div className="mt-6">{children}</div>
    </section>
  );
}

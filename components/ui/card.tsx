import type { ComponentProps } from "react";

import { cn } from "@/lib/utils";

type CardProps = ComponentProps<"div"> & {
  /** Subtle lift and gold edge on hover (for clickable cards). */
  interactive?: boolean;
};

export function Card({ className, interactive = false, ...props }: CardProps) {
  return (
    <div
      className={cn(
        "rounded-lg border border-border bg-surface p-6",
        interactive &&
          "transition-[transform,border-color,box-shadow] duration-300 ease-luxe hover:-translate-y-0.5 hover:border-accent/40 hover:shadow-[0_18px_40px_-20px_var(--glow)]",
        className,
      )}
      {...props}
    />
  );
}

export function CardTitle({ className, ...props }: ComponentProps<"h3">) {
  return <h3 className={cn("text-lg font-semibold text-text", className)} {...props} />;
}

export function CardDescription({ className, ...props }: ComponentProps<"p">) {
  return <p className={cn("text-sm leading-relaxed text-muted", className)} {...props} />;
}

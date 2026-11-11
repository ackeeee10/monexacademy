import { CheckCircle2, Info, TriangleAlert } from "lucide-react";
import type { ComponentProps } from "react";

import { cn } from "@/lib/utils";

const styles = {
  info: { box: "border-border bg-surface-2 text-text", Icon: Info, icon: "text-accent" },
  success: { box: "border-success/40 bg-success/10 text-text", Icon: CheckCircle2, icon: "text-success" },
  danger: { box: "border-danger/40 bg-danger/10 text-text", Icon: TriangleAlert, icon: "text-danger" },
} as const;

type AlertProps = ComponentProps<"div"> & { variant?: keyof typeof styles };

export function Alert({ variant = "info", className, children, ...props }: AlertProps) {
  const { box, Icon, icon } = styles[variant];
  return (
    <div
      role={variant === "danger" ? "alert" : "status"}
      className={cn("flex gap-3 rounded-md border px-4 py-3 text-sm leading-relaxed", box, className)}
      {...props}
    >
      <Icon className={cn("mt-0.5 size-4 shrink-0", icon)} aria-hidden />
      <div className="min-w-0">{children}</div>
    </div>
  );
}

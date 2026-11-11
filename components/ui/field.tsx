import type { ComponentProps, ReactNode } from "react";

import { cn } from "@/lib/utils";

import { Label } from "./input";

type FieldProps = {
  id: string;
  label: ReactNode;
  hint?: ReactNode;
  error?: string;
  className?: string;
  children: ReactNode;
  /** Right side of the label row (e.g. "Forgot password?"). */
  aside?: ReactNode;
};

/** Label + control + hint/error, wired up for screen readers via ids. */
export function Field({ id, label, hint, error, className, children, aside }: FieldProps) {
  return (
    <div className={cn("space-y-2", className)}>
      <div className="flex items-center justify-between gap-3">
        <Label htmlFor={id}>{label}</Label>
        {aside}
      </div>
      {children}
      {error ? (
        <p id={`${id}-error`} role="alert" className="text-sm text-danger">
          {error}
        </p>
      ) : hint ? (
        <p id={`${id}-hint`} className="text-xs text-muted">
          {hint}
        </p>
      ) : null}
    </div>
  );
}

/** aria props for a control inside <Field>. */
export function fieldAria(id: string, error?: string, hasHint?: boolean) {
  return {
    id,
    "aria-invalid": error ? true : undefined,
    "aria-describedby": error ? `${id}-error` : hasHint ? `${id}-hint` : undefined,
  } as const;
}

export function Textarea({ className, ...props }: ComponentProps<"textarea">) {
  return (
    <textarea
      className={cn(
        "min-h-28 w-full rounded-md border border-border bg-surface px-3.5 py-2.5 text-sm leading-relaxed text-text placeholder:text-muted",
        "transition-colors duration-200 focus-visible:border-accent focus-visible:outline-none aria-invalid:border-danger",
        className,
      )}
      {...props}
    />
  );
}

export function Select({ className, ...props }: ComponentProps<"select">) {
  return (
    <select
      className={cn(
        "ma-select h-10 w-full rounded-md border border-border bg-surface px-3.5 pr-10 text-sm text-text",
        "transition-colors duration-200 focus-visible:border-accent focus-visible:outline-none aria-invalid:border-danger",
        className,
      )}
      {...props}
    />
  );
}

export function Checkbox({ className, ...props }: Omit<ComponentProps<"input">, "type">) {
  return <input type="checkbox" className={cn("ma-checkbox", className)} {...props} />;
}

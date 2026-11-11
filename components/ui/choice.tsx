"use client";

import { Check } from "lucide-react";
import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

type ChoiceCardProps = {
  selected: boolean;
  onSelect: () => void;
  title: ReactNode;
  description?: ReactNode;
  /** Checkbox behaviour (multi-select) vs radio (single). */
  multiple?: boolean;
  className?: string;
};

/** Large selectable card for onboarding-style questions. */
export function ChoiceCard({ selected, onSelect, title, description, multiple = false, className }: ChoiceCardProps) {
  return (
    <button
      type="button"
      role={multiple ? "checkbox" : "radio"}
      aria-checked={selected}
      onClick={onSelect}
      className={cn(
        "group flex w-full items-start gap-4 rounded-lg border bg-surface p-4 text-left transition-[border-color,background-color,box-shadow] duration-200 ease-luxe",
        selected
          ? "border-accent bg-accent/[0.06] shadow-[0_0_0_1px_var(--accent)]"
          : "border-border hover:border-accent/40 hover:bg-surface-2",
        className,
      )}
    >
      <span
        className={cn(
          "mt-0.5 flex size-5 shrink-0 items-center justify-center border transition-colors",
          multiple ? "rounded-[5px]" : "rounded-full",
          selected ? "border-accent bg-accent text-accent-foreground" : "border-border",
        )}
      >
        {selected && <Check className="size-3.5" strokeWidth={3} aria-hidden />}
      </span>
      <span className="min-w-0">
        <span className="block font-medium text-text">{title}</span>
        {description && <span className="mt-1 block text-sm text-muted">{description}</span>}
      </span>
    </button>
  );
}

type ChipProps = {
  selected: boolean;
  onToggle: () => void;
  children: ReactNode;
};

/** Small toggle chip for picking many items (skills, categories). */
export function Chip({ selected, onToggle, children }: ChipProps) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={selected}
      onClick={onToggle}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-sm transition-colors duration-200",
        selected
          ? "border-accent bg-accent/10 text-accent"
          : "border-border bg-surface text-muted hover:border-accent/40 hover:text-text",
      )}
    >
      {selected && <Check className="size-3.5" strokeWidth={2.5} aria-hidden />}
      {children}
    </button>
  );
}

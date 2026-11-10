"use client";

import { Popover } from "radix-ui";
import { useRef, useState, type ReactNode } from "react";

type TermProps = {
  children: ReactNode;
  /** One-sentence plain-English explanation of the term. */
  definition: string;
};

/**
 * Explains jargon (MVP, margin, unit economics…) on hover or tap (Master Prompt 2).
 * Uses a popover rather than a tooltip so it also works on touch screens.
 */
export function Term({ children, definition }: TermProps) {
  const [open, setOpen] = useState(false);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const show = () => {
    if (closeTimer.current) clearTimeout(closeTimer.current);
    setOpen(true);
  };
  const hide = () => {
    closeTimer.current = setTimeout(() => setOpen(false), 120);
  };

  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Trigger
        className="cursor-help underline decoration-accent/60 decoration-dotted underline-offset-4"
        onPointerEnter={(e) => e.pointerType === "mouse" && show()}
        onPointerLeave={(e) => e.pointerType === "mouse" && hide()}
      >
        {children}
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          side="top"
          sideOffset={8}
          onPointerEnter={show}
          onPointerLeave={hide}
          onOpenAutoFocus={(e) => e.preventDefault()}
          className="z-50 max-w-xs rounded-md border border-border bg-surface-2 px-3.5 py-2.5 text-sm leading-relaxed text-text shadow-xl"
        >
          {definition}
          <Popover.Arrow className="fill-[var(--surface-2)]" />
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}

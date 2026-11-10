import { cva, type VariantProps } from "class-variance-authority";
import { Slot } from "radix-ui";
import type { ComponentProps } from "react";

import { cn } from "@/lib/utils";

const buttonVariants = cva(
  [
    "inline-flex shrink-0 items-center justify-center gap-2 whitespace-nowrap font-medium",
    "rounded-md transition-[background-color,border-color,color,box-shadow,transform] duration-200 ease-luxe",
    "disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0",
    "active:translate-y-px",
  ],
  {
    variants: {
      variant: {
        /** Gold accent — reserved for the main call to action on a screen. */
        primary:
          "bg-accent text-accent-foreground shadow-[0_0_0_1px_var(--accent)] hover:shadow-[0_0_0_1px_var(--accent),0_8px_28px_-6px_var(--glow)] hover:brightness-[1.06]",
        secondary: "border border-border bg-surface text-text hover:border-accent/50 hover:bg-surface-2",
        ghost: "text-muted hover:bg-surface-2 hover:text-text",
        link: "h-auto px-0 text-accent underline-offset-4 hover:underline",
      },
      size: {
        sm: "h-9 px-3.5 text-sm",
        md: "h-10 px-5 text-sm",
        lg: "h-12 px-7 text-base",
        icon: "size-10",
      },
    },
    defaultVariants: { variant: "primary", size: "md" },
  },
);

type ButtonProps = ComponentProps<"button"> &
  VariantProps<typeof buttonVariants> & {
    /** Render the child element (e.g. a Link) with button styles. */
    asChild?: boolean;
  };

export function Button({ className, variant, size, asChild = false, type, ...props }: ButtonProps) {
  const Comp = asChild ? Slot.Root : "button";
  return (
    <Comp
      data-slot="button"
      className={cn(buttonVariants({ variant, size }), className)}
      {...(asChild ? {} : { type: type ?? "button" })}
      {...props}
    />
  );
}

export { buttonVariants };

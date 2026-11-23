import { cn } from "@/lib/utils";

import { MARK_PATH, WORDMARK_ACADEMY, WORDMARK_MAIN_QUEST } from "./logo-paths";

type LogoProps = {
  className?: string;
  /** Accessible label. Pass `null` when the logo is purely decorative. */
  title?: string | null;
};

function MarkShapes() {
  return <path fill="currentColor" d={MARK_PATH} />;
}

function a11yProps(title: string | null) {
  return title === null
    ? ({ "aria-hidden": true, focusable: false } as const)
    : ({ role: "img", "aria-label": title } as const);
}

/** Full logo: mark + "MAIN QUEST / ACADEMY" wordmark. Inherits the current text color. */
export function Logo({ className, title = "Main Quest Academy" }: LogoProps) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="-4 2 1080 162"
      className={cn("h-8 w-auto", className)}
      {...a11yProps(title)}
    >
      <g fill="currentColor">
        <MarkShapes />
        <path d={WORDMARK_MAIN_QUEST} />
        <path d={WORDMARK_ACADEMY} />
      </g>
    </svg>
  );
}

/** The crown-shaped M mark alone — used for favicon, app icon and compact spaces. */
export function LogoMark({ className, title = "Main Quest Academy" }: LogoProps) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="-4 33 259 108"
      className={cn("h-8 w-auto", className)}
      {...a11yProps(title)}
    >
      <MarkShapes />
    </svg>
  );
}

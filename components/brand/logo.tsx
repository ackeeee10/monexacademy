import { cn } from "@/lib/utils";

import { MARK_ARROW, MARK_STROKES, WORDMARK_ACADEMY, WORDMARK_MAIN_QUEST } from "./logo-paths";

type LogoProps = {
  className?: string;
  /** Accessible label. Pass `null` when the logo is purely decorative. */
  title?: string | null;
};

function MarkShapes() {
  return (
    <>
      <g
        fill="none"
        stroke="currentColor"
        strokeWidth={24}
        strokeLinejoin="miter"
        strokeMiterlimit={10}
        strokeLinecap="butt"
      >
        {MARK_STROKES.map((d) => (
          <path key={d} d={d} />
        ))}
      </g>
      <path fill="currentColor" d={MARK_ARROW} />
    </>
  );
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
      viewBox="-2 2 982 162"
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

/** The M mark alone — used for favicon, app icon and compact spaces. */
export function LogoMark({ className, title = "Main Quest Academy" }: LogoProps) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="-8 -1 182 168"
      className={cn("h-8 w-auto", className)}
      {...a11yProps(title)}
    >
      <MarkShapes />
    </svg>
  );
}

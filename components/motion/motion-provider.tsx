"use client";

import { MotionConfig } from "motion/react";
import type { ReactNode } from "react";

/** Disables motion for users who prefer reduced motion (Master Prompt 3.5). */
export function MotionProvider({ children }: { children: ReactNode }) {
  return <MotionConfig reducedMotion="user">{children}</MotionConfig>;
}

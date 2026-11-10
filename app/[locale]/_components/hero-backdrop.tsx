"use client";

import { motion } from "motion/react";

/** Deep navy gradient with a fine gold growth line (Master Prompt 5.5). Decorative only. */
export function HeroBackdrop() {
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 -z-10">
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_80%_60%_at_70%_20%,color-mix(in_oklab,var(--brand)_var(--hero-tint),transparent),transparent_70%)]" />
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_50%_40%_at_10%_90%,color-mix(in_oklab,var(--brand)_calc(var(--hero-tint)*0.55),transparent),transparent_70%)]" />
      <div className="absolute inset-0 bg-[linear-gradient(to_right,var(--border)_1px,transparent_1px),linear-gradient(to_bottom,var(--border)_1px,transparent_1px)] bg-[size:72px_72px] opacity-[var(--grid-opacity)] [mask-image:radial-gradient(ellipse_70%_60%_at_60%_40%,black,transparent)]" />
      <svg className="absolute inset-0 h-full w-full" viewBox="0 0 1440 900" preserveAspectRatio="none" fill="none">
        <defs>
          <linearGradient id="growth-line" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0" stopColor="var(--accent)" stopOpacity="0" />
            <stop offset="0.55" stopColor="var(--accent)" stopOpacity="0.55" />
            <stop offset="1" stopColor="var(--accent)" stopOpacity="0.9" />
          </linearGradient>
        </defs>
        <motion.path
          d="M -20 760 C 220 740 340 690 520 700 S 820 600 960 520 S 1200 330 1460 150"
          stroke="url(#growth-line)"
          strokeWidth="1.5"
          vectorEffect="non-scaling-stroke"
          initial={{ pathLength: 0 }}
          animate={{ pathLength: 1 }}
          transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1], delay: 0.3 }}
        />
      </svg>
      <div className="absolute inset-x-0 bottom-0 h-40 bg-gradient-to-b from-transparent to-bg" />
    </div>
  );
}

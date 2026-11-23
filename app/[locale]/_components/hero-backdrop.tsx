"use client";

import { motion } from "motion/react";

import { CONTOURS, MILESTONES, TRAIL } from "./quest-data";

const EASE = [0.22, 1, 0.36, 1] as const;
const TRAIL_DURATION = 1.6;

/**
 * Deep navy gradient with a gold "quest map": topographic contours and a trail
 * that climbs past milestones to a summit flag at the top right. Decorative
 * only; the left side fades so the headline stays readable.
 */
export function HeroBackdrop() {
  const summit = MILESTONES[MILESTONES.length - 1]!;

  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 -z-10">
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_80%_60%_at_70%_20%,color-mix(in_oklab,var(--brand)_var(--hero-tint),transparent),transparent_70%)]" />
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_50%_40%_at_10%_90%,color-mix(in_oklab,var(--brand)_calc(var(--hero-tint)*0.55),transparent),transparent_70%)]" />
      <div className="absolute inset-0 bg-[linear-gradient(to_right,var(--border)_1px,transparent_1px),linear-gradient(to_bottom,var(--border)_1px,transparent_1px)] bg-[size:72px_72px] opacity-[var(--grid-opacity)] [mask-image:radial-gradient(ellipse_70%_60%_at_60%_40%,black,transparent)]" />

      <svg
        className="absolute inset-0 h-full w-full opacity-45 sm:opacity-100 [mask-image:linear-gradient(to_right,rgb(0_0_0/0.18),rgb(0_0_0/0.55)_40%,black_75%)]"
        viewBox="0 0 1440 900"
        preserveAspectRatio="xMaxYMid slice"
        fill="none"
      >
        <defs>
          <linearGradient id="trail-line" x1="0" y1="1" x2="1" y2="0">
            <stop offset="0" stopColor="var(--accent)" stopOpacity="0.2" />
            <stop offset="0.55" stopColor="var(--accent)" stopOpacity="0.75" />
            <stop offset="1" stopColor="var(--accent)" stopOpacity="1" />
          </linearGradient>
          <radialGradient id="summit-glow">
            <stop offset="0" stopColor="var(--accent)" stopOpacity="0.55" />
            <stop offset="1" stopColor="var(--accent)" stopOpacity="0" />
          </radialGradient>
        </defs>

        {/* Topographic contours */}
        {CONTOURS.map((d, i) => (
          <motion.path
            key={d}
            d={d}
            stroke="var(--text-muted)"
            strokeOpacity={0.22 + i * 0.03}
            strokeWidth="1"
            initial={{ pathLength: 0, opacity: 0 }}
            animate={{ pathLength: 1, opacity: 1 }}
            transition={{ duration: 1.2, delay: 0.1 + i * 0.08, ease: EASE }}
          />
        ))}

        {/* Faint full trail, then the gold trail drawing itself on top */}
        <path d={TRAIL} stroke="var(--accent)" strokeOpacity="0.12" strokeWidth="2" strokeDasharray="2 8" strokeLinecap="round" />
        <motion.path
          d={TRAIL}
          stroke="url(#trail-line)"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeDasharray="10 9"
          initial={{ pathLength: 0, opacity: 0 }}
          animate={{ pathLength: 1, opacity: 1 }}
          transition={{ duration: TRAIL_DURATION, delay: 0.35, ease: EASE }}
        />

        {/* Milestones light up as the trail reaches them */}
        {MILESTONES.slice(0, -1).map((m, i) => (
          <motion.g
            key={`${m.x}-${m.y}`}
            initial={{ opacity: 0, scale: 0.4 }}
            animate={{ opacity: 1, scale: 1 }}
            style={{ transformBox: "fill-box", originX: 0.5, originY: 0.5 }}
            transition={{ duration: 0.35, delay: 0.35 + TRAIL_DURATION * ((i + 1) / MILESTONES.length), ease: EASE }}
          >
            <circle cx={m.x} cy={m.y} r="9" fill="var(--bg)" stroke="var(--accent)" strokeOpacity="0.8" strokeWidth="1.5" />
            <circle cx={m.x} cy={m.y} r="3" fill="var(--accent)" />
          </motion.g>
        ))}

        {/* Summit with flag */}
        <motion.g
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.35 + TRAIL_DURATION, ease: EASE }}
        >
          <circle cx={summit.x} cy={summit.y} r="40" fill="url(#summit-glow)" />
          <circle cx={summit.x} cy={summit.y} r="5" fill="var(--accent)" />
          <line x1={summit.x} x2={summit.x} y1={summit.y} y2={summit.y - 48} stroke="var(--accent)" strokeWidth="2" strokeLinecap="round" />
          <path
            d={`M ${summit.x} ${summit.y - 48} L ${summit.x + 30} ${summit.y - 39} L ${summit.x} ${summit.y - 30} Z`}
            fill="var(--accent)"
            fillOpacity="0.85"
          />
        </motion.g>
      </svg>

      <div className="absolute inset-x-0 bottom-0 h-40 bg-gradient-to-b from-transparent to-bg" />
    </div>
  );
}

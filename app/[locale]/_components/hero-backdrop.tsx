"use client";

import { motion } from "motion/react";

import { CANDLE_BODY, CANDLES, MOVING_AVERAGE, PRICE_LEVELS } from "./market-data";

const EASE = [0.22, 1, 0.36, 1] as const;
const STAGGER = 0.022;
const CANDLES_DONE = CANDLES.length * STAGGER;

/**
 * Deep navy gradient with a gold candlestick chart rising to the top right
 * (Master Prompt 5.5). Decorative only; the left side fades so the headline
 * stays readable.
 */
export function HeroBackdrop() {
  const first = CANDLES[0]!;
  const last = CANDLES[CANDLES.length - 1]!;

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
          <linearGradient id="ma-line" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0" stopColor="var(--accent)" stopOpacity="0.15" />
            <stop offset="0.6" stopColor="var(--accent)" stopOpacity="0.7" />
            <stop offset="1" stopColor="var(--accent)" stopOpacity="1" />
          </linearGradient>
          <linearGradient id="ma-area" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="var(--accent)" stopOpacity="0.12" />
            <stop offset="1" stopColor="var(--accent)" stopOpacity="0" />
          </linearGradient>
          <radialGradient id="last-glow">
            <stop offset="0" stopColor="var(--accent)" stopOpacity="0.5" />
            <stop offset="1" stopColor="var(--accent)" stopOpacity="0" />
          </radialGradient>
        </defs>

        {/* Price levels */}
        {PRICE_LEVELS.map(({ y, label }) => (
          <g key={y}>
            <line x1="0" x2="1440" y1={y} y2={y} stroke="var(--border)" strokeDasharray="2 6" strokeWidth="1" />
            <text x="1428" y={y - 6} textAnchor="end" fill="var(--text-muted)" fontSize="11" opacity="0.6" className="tabular">
              {label}
            </text>
          </g>
        ))}

        {/* Soft area under the moving average */}
        <motion.path
          d={`${MOVING_AVERAGE} L ${last.x} 900 L ${first.x} 900 Z`}
          fill="url(#ma-area)"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.6, delay: CANDLES_DONE * 0.6 }}
        />

        {/* Candles: filled gold when the price rises, hollow when it falls */}
        {CANDLES.map((c, i) => {
          const top = Math.min(c.open, c.close);
          const height = Math.max(2, Math.abs(c.close - c.open));
          return (
            <motion.g
              key={c.x}
              style={{ transformBox: "fill-box", originY: 1 }}
              initial={{ opacity: 0, scaleY: 0.2 }}
              animate={{ opacity: 1, scaleY: 1 }}
              transition={{ duration: 0.45, delay: 0.15 + i * STAGGER, ease: EASE }}
            >
              <line
                x1={c.x}
                x2={c.x}
                y1={c.high}
                y2={c.low}
                stroke={c.up ? "var(--accent)" : "var(--text-muted)"}
                strokeOpacity={c.up ? 0.75 : 0.45}
                strokeWidth="1.25"
              />
              <rect
                x={c.x - CANDLE_BODY / 2}
                y={top}
                width={CANDLE_BODY}
                height={height}
                rx="1.5"
                fill={c.up ? "var(--accent)" : "var(--bg)"}
                fillOpacity={c.up ? 0.6 : 1}
                stroke={c.up ? "var(--accent)" : "var(--text-muted)"}
                strokeOpacity={c.up ? 0.9 : 0.5}
                strokeWidth="1.25"
              />
            </motion.g>
          );
        })}

        {/* Moving average: the gold growth line */}
        <motion.path
          d={MOVING_AVERAGE}
          stroke="url(#ma-line)"
          strokeWidth="2"
          strokeLinecap="round"
          initial={{ pathLength: 0, opacity: 0 }}
          animate={{ pathLength: 1, opacity: 1 }}
          transition={{ duration: 0.6, delay: CANDLES_DONE * 0.5, ease: EASE }}
        />

        {/* Latest price marker */}
        <motion.g
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.4, delay: CANDLES_DONE + 0.2 }}
        >
          <line x1={last.x} x2="1440" y1={last.close} y2={last.close} stroke="var(--accent)" strokeOpacity="0.5" strokeDasharray="3 4" />
          <circle cx={last.x} cy={last.close} r="22" fill="url(#last-glow)" />
          <circle cx={last.x} cy={last.close} r="3.5" fill="var(--accent)" />
        </motion.g>
      </svg>

      <div className="absolute inset-x-0 bottom-0 h-40 bg-gradient-to-b from-transparent to-bg" />
    </div>
  );
}

/**
 * Deterministic, made-up candlestick series for the hero background.
 * It is decorative only (an upward "growth" market), never real data.
 * Coordinates are in the hero SVG's 1440×900 viewBox; smaller y = higher price.
 */

export type Candle = {
  x: number;
  open: number;
  close: number;
  high: number;
  low: number;
  up: boolean;
};

// Leave room on the right for the price labels.
const WIDTH = 1340;
const COUNT = 58;
export const CANDLE_STEP = WIDTH / COUNT;
export const CANDLE_BODY = CANDLE_STEP * 0.46;

/** Small seeded PRNG (mulberry32) so server and client render identical candles. */
function seeded(seed: number) {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Flat start, then an accelerating climb toward the top-right corner. */
function trend(t: number): number {
  return 760 - 600 * Math.pow(t, 1.7);
}

function buildCandles(): Candle[] {
  const rand = seeded(20261111);
  const candles: Candle[] = [];
  let open = trend(0);

  for (let i = 0; i < COUNT; i++) {
    const t = i / (COUNT - 1);
    // Pull toward the trend with noise; occasional pullbacks keep it believable.
    const noise = (rand() - 0.5) * 58 + (rand() < 0.22 ? 34 : 0);
    const close = open + (trend(t) - open) * 0.55 + noise;
    const wickTop = 6 + rand() * 22;
    const wickBottom = 6 + rand() * 22;
    candles.push({
      x: i * CANDLE_STEP + CANDLE_STEP / 2,
      open,
      close,
      high: Math.min(open, close) - wickTop,
      low: Math.max(open, close) + wickBottom,
      up: close < open,
    });
    open = close;
  }
  return candles;
}

export const CANDLES = buildCandles();

/** Smooth moving-average path through the closes (the "growth line"). */
function movingAveragePath(candles: Candle[], period: number): string {
  const points = candles.map((c, i) => {
    const slice = candles.slice(Math.max(0, i - period + 1), i + 1);
    const avg = slice.reduce((sum, s) => sum + s.close, 0) / slice.length;
    return [c.x, avg] as const;
  });

  // Catmull-Rom to cubic Bézier for a soft curve.
  let d = `M ${points[0]![0].toFixed(1)} ${points[0]![1].toFixed(1)}`;
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[i - 1] ?? points[i]!;
    const p1 = points[i]!;
    const p2 = points[i + 1]!;
    const p3 = points[i + 2] ?? p2;
    const c1 = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6];
    const c2 = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6];
    d += ` C ${c1[0]!.toFixed(1)} ${c1[1]!.toFixed(1)}, ${c2[0]!.toFixed(1)} ${c2[1]!.toFixed(1)}, ${p2[0].toFixed(1)} ${p2[1].toFixed(1)}`;
  }
  return d;
}

export const MOVING_AVERAGE = movingAveragePath(CANDLES, 6);

/** Horizontal price levels for the faint grid on the right edge. */
export const PRICE_LEVELS = [180, 330, 480, 630, 780].map((y, i) => ({
  y,
  label: (12_400 + (4 - i) * 1_850).toLocaleString("en-US"),
}));

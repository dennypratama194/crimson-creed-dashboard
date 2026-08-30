export type KpiDelta = {
  /** Signed percentage change vs. the previous period, e.g. `15.5` or `-10.5`. */
  pct: number;
  direction: "up" | "down" | "flat";
};

/** A KPI value paired with the baseline it is compared against. */
export type KpiTrend = {
  previous: number;
  delta: KpiDelta;
};

/**
 * Percentage change from `previous` to `current`. With no baseline
 * (`previous` is 0) a non-zero `current` counts as a full +100% swing.
 * Negative baselines (e.g. a cash deficit) compare against their magnitude.
 */
export function pctDelta(current: number, previous: number): KpiDelta {
  const diff = current - previous;
  const base = Math.abs(previous);
  const raw = base === 0 ? (diff === 0 ? 0 : 100) : (diff / base) * 100;
  const pct = Math.round(raw * 10) / 10;
  return { pct, direction: pct > 0 ? "up" : pct < 0 ? "down" : "flat" };
}

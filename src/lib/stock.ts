export type StockState = "ok" | "low" | "out";

/**
 * Out at zero or below; low once a positive threshold is reached. Mirrored in
 * SQL by `admin_dashboard()` (migration 0056) — keep the two in step.
 */
export function stockState(qty: number, threshold: number): StockState {
  if (qty <= 0) return "out";
  if (threshold > 0 && qty <= threshold) return "low";
  return "ok";
}

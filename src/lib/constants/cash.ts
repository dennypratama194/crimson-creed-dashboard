import {
  CASH_EXPENSE_CATEGORIES,
  CASH_INCOME_CATEGORIES,
  type CashCategory,
  type CashDirection,
} from "@/lib/constants/enums";

/**
 * Which direction each category belongs to. Mirrors
 * `app.cash_category_direction()` in supabase/migrations/0025_cash.sql — the
 * server re-checks this, the UI uses it to filter the category picker.
 */
export const CASH_CATEGORY_DIRECTION: Record<CashCategory, CashDirection> = {
  SALES_REVENUE: "IN",
  CAPITAL_INJECTION: "IN",
  OTHER_INCOME: "IN",
  PAYROLL: "OUT",
  INVENTORY_PURCHASE: "OUT",
  OPERATING_EXPENSE: "OUT",
  WITHDRAWAL: "OUT",
  OTHER_EXPENSE: "OUT",
};

export function cashCategoriesFor(
  direction: CashDirection,
): readonly [CashCategory, ...CashCategory[]] {
  return direction === "IN" ? CASH_INCOME_CATEGORIES : CASH_EXPENSE_CATEGORIES;
}

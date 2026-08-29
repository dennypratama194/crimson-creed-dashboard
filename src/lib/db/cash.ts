import "server-only";

import type {
  CashCategory,
  CashDirection,
  CashEntrySource,
} from "@/lib/constants/enums";
import type { Tables } from "@/lib/database.types";
import { getMemberNames } from "@/lib/db/members";
import { createClient } from "@/lib/supabase/server";

export type CashEntry = Tables<"cash_entries">;

export const CASH_ENTRY_PAGE_SIZE = 25;

export async function getCashBalance(): Promise<number> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("cash_account")
    .select("balance")
    .eq("id", true)
    .maybeSingle();
  return data?.balance ?? 0;
}

export type CashSummary = {
  incomeTotal: number;
  expenseTotal: number;
  net: number;
  entryCount: number;
};

/** Income / expense totals over an optional [from, to) window (ISO strings). */
export async function getCashSummary(range?: {
  from?: string;
  to?: string;
}): Promise<CashSummary> {
  const supabase = await createClient();
  let query = supabase.from("cash_entries").select("direction, amount");
  if (range?.from) query = query.gte("occurred_at", range.from);
  if (range?.to) query = query.lt("occurred_at", range.to);

  const { data, error } = await query;
  if (error) throw error;

  const summary: CashSummary = {
    incomeTotal: 0,
    expenseTotal: 0,
    net: 0,
    entryCount: (data ?? []).length,
  };
  for (const row of data ?? []) {
    if (row.direction === "IN") summary.incomeTotal += row.amount;
    else summary.expenseTotal += row.amount;
  }
  summary.net =
    Math.round((summary.incomeTotal - summary.expenseTotal) * 100) / 100;
  return summary;
}

export type CashEntryRow = CashEntry & { created_by_name: string | null };

export async function listCashEntries(options: {
  page?: number;
  direction?: CashDirection;
  category?: CashCategory;
  source?: CashEntrySource;
}): Promise<{
  rows: CashEntryRow[];
  total: number;
  page: number;
  pageSize: number;
}> {
  const supabase = await createClient();
  const page = Math.max(1, options.page ?? 1);
  const pageSize = CASH_ENTRY_PAGE_SIZE;
  const offset = (page - 1) * pageSize;

  let query = supabase
    .from("cash_entries")
    .select("*", { count: "exact" })
    .order("occurred_at", { ascending: false })
    .order("created_at", { ascending: false });

  if (options.direction) query = query.eq("direction", options.direction);
  if (options.category) query = query.eq("category", options.category);
  if (options.source) query = query.eq("source", options.source);

  const { data, error, count } = await query.range(
    offset,
    offset + pageSize - 1,
  );
  if (error) throw error;

  const rows = data ?? [];
  const names = await getMemberNames(
    rows.map((r) => r.created_by).filter((v): v is string => v !== null),
  );

  return {
    rows: rows.map((r) => ({
      ...r,
      created_by_name: r.created_by ? (names.get(r.created_by) ?? null) : null,
    })),
    total: count ?? 0,
    page,
    pageSize,
  };
}

export type CashEntryDetail = {
  entry: CashEntry;
  createdByName: string | null;
  /** The reversal entry that cancels this one, if any. */
  reversedBy: CashEntry | null;
  /** The original entry this one reverses, if this is itself a reversal. */
  reverses: CashEntry | null;
};

export async function getCashEntryDetail(
  id: string,
): Promise<CashEntryDetail | null> {
  const supabase = await createClient();

  const { data: entry } = await supabase
    .from("cash_entries")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (!entry) return null;

  const [{ data: reversedBy }, { data: reverses }] = await Promise.all([
    supabase
      .from("cash_entries")
      .select("*")
      .eq("reverses_entry_id", id)
      .maybeSingle(),
    entry.reverses_entry_id
      ? supabase
          .from("cash_entries")
          .select("*")
          .eq("id", entry.reverses_entry_id)
          .maybeSingle()
      : Promise.resolve({ data: null }),
  ]);

  const createdByName = entry.created_by
    ? ((await getMemberNames([entry.created_by])).get(entry.created_by) ?? null)
    : null;

  return {
    entry,
    createdByName,
    reversedBy: reversedBy ?? null,
    reverses: reverses ?? null,
  };
}

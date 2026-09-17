import "server-only";

import type {
  CashCategory,
  CashDirection,
  CashEntrySource,
} from "@/lib/constants/enums";
import type { Tables } from "@/lib/database.types";
import { getMemberNames } from "@/lib/db/members";
import { cashSummaryPayload, parseRpcPayload } from "@/lib/db/contracts";
import { isUuid } from "@/lib/db/ids";
import { pageBounds } from "@/lib/db/paging";
import { createClient } from "@/lib/supabase/server";

export type CashEntry = Tables<"cash_entries">;

export const CASH_ENTRY_PAGE_SIZE = 25;

/**
 * The treasury balance. A ledger with no account row yet genuinely holds 0; a
 * failed read throws, so an outage never renders as an empty treasury.
 */
export async function getCashBalance(): Promise<number> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("cash_account")
    .select("balance")
    .eq("id", true)
    .maybeSingle();
  if (error) throw error;
  return data?.balance ?? 0;
}

export type CashSummary = {
  incomeTotal: number;
  expenseTotal: number;
  net: number;
  entryCount: number;
};

/**
 * Income / expense totals over an optional [from, to) window (ISO strings),
 * summed in SQL by the Super-Admin-gated `cash_summary()` RPC (0057).
 */
export async function getCashSummary(range?: {
  from?: string;
  to?: string;
}): Promise<CashSummary> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("cash_summary", {
    p_from: range?.from ?? null,
    p_to: range?.to ?? null,
  });
  if (error) throw error;
  return parseRpcPayload(cashSummaryPayload, data, "cash_summary");
}

export type CashEntryRow = CashEntry & {
  created_by_name: string | null;
  handled_by_name: string | null;
};

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
  const pageSize = CASH_ENTRY_PAGE_SIZE;
  const { page, from, to } = pageBounds(options.page, pageSize);

  let query = supabase
    .from("cash_entries")
    .select("*", { count: "exact" })
    .order("occurred_at", { ascending: false })
    .order("created_at", { ascending: false })
    .order("id", { ascending: false });

  if (options.direction) query = query.eq("direction", options.direction);
  if (options.category) query = query.eq("category", options.category);
  if (options.source) query = query.eq("source", options.source);

  const { data, error, count } = await query.range(from, to);
  if (error) throw error;

  const rows = data ?? [];
  const names = await getMemberNames(
    rows
      .flatMap((r) => [r.created_by, r.handled_by])
      .filter((v): v is string => v !== null),
  );

  return {
    rows: rows.map((r) => ({
      ...r,
      created_by_name: r.created_by ? (names.get(r.created_by) ?? null) : null,
      handled_by_name: r.handled_by ? (names.get(r.handled_by) ?? null) : null,
    })),
    total: count ?? 0,
    page,
    pageSize,
  };
}

export type CashEntryDetail = {
  entry: CashEntry;
  createdByName: string | null;
  handledByName: string | null;
  /** The reversal entry that cancels this one, if any. */
  reversedBy: CashEntry | null;
  /** The original entry this one reverses, if this is itself a reversal. */
  reverses: CashEntry | null;
};

export async function getCashEntryDetail(
  id: string,
): Promise<CashEntryDetail | null> {
  if (!isUuid(id)) return null;
  const supabase = await createClient();

  const { data: entry, error } = await supabase
    .from("cash_entries")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  if (!entry) return null;

  const [reversedByRes, reversesRes] = await Promise.all([
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
      : Promise.resolve({ data: null, error: null }),
  ]);
  if (reversedByRes.error) throw reversedByRes.error;
  if (reversesRes.error) throw reversesRes.error;
  const reversedBy = reversedByRes.data;
  const reverses = reversesRes.data;

  const names = await getMemberNames(
    [entry.created_by, entry.handled_by].filter((v): v is string => v !== null),
  );

  return {
    entry,
    createdByName: entry.created_by
      ? (names.get(entry.created_by) ?? null)
      : null,
    handledByName: entry.handled_by
      ? (names.get(entry.handled_by) ?? null)
      : null,
    reversedBy: reversedBy ?? null,
    reverses: reverses ?? null,
  };
}

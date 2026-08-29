import "server-only";

import type { PayrollRunStatus } from "@/lib/constants/enums";
import type { Tables } from "@/lib/database.types";
import { getMemberNames } from "@/lib/db/members";
import { createClient } from "@/lib/supabase/server";

export type PayrollRun = Tables<"payroll_runs">;
export type PayrollRunLine = Tables<"payroll_run_lines">;

export const PAYROLL_RUN_PAGE_SIZE = 20;

export async function listPayrollRuns(options: {
  page?: number;
  status?: PayrollRunStatus;
}): Promise<{
  rows: PayrollRun[];
  total: number;
  page: number;
  pageSize: number;
}> {
  const supabase = await createClient();
  const page = Math.max(1, options.page ?? 1);
  const pageSize = PAYROLL_RUN_PAGE_SIZE;
  const offset = (page - 1) * pageSize;

  let query = supabase
    .from("payroll_runs")
    .select("*", { count: "exact" })
    .order("period_start", { ascending: false });

  if (options.status) query = query.eq("status", options.status);

  const { data, error, count } = await query.range(
    offset,
    offset + pageSize - 1,
  );
  if (error) throw error;

  return { rows: data ?? [], total: count ?? 0, page, pageSize };
}

export type PayrollRunDetail = {
  run: PayrollRun;
  lines: PayrollRunLine[];
};

export async function getPayrollRunDetail(
  id: string,
): Promise<PayrollRunDetail | null> {
  const supabase = await createClient();

  const { data: run } = await supabase
    .from("payroll_runs")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (!run) return null;

  const { data: lines } = await supabase
    .from("payroll_run_lines")
    .select("*")
    .eq("payroll_run_id", id)
    .order("gross_amount", { ascending: false });

  return { run, lines: lines ?? [] };
}

export type PayrollPreviewLine = {
  member_id: string;
  member_name: string;
  log_count: number;
  gross_amount: number;
};

/**
 * What `finalize_payroll_run` would roll up for a period, computed the same way
 * (APPROVED logs not yet in a run, `occurred_at` within [start, end]).
 */
export async function previewPayrollPeriod(
  periodStart: string,
  periodEnd: string,
): Promise<{ lines: PayrollPreviewLine[]; total: number }> {
  const supabase = await createClient();

  const endExclusive = new Date(`${periodEnd}T00:00:00Z`);
  endExclusive.setUTCDate(endExclusive.getUTCDate() + 1);

  const { data, error } = await supabase
    .from("production_logs")
    .select("member_id, payout_amount")
    .eq("status", "APPROVED")
    .is("payroll_run_id", null)
    .gte("occurred_at", `${periodStart}T00:00:00Z`)
    .lt("occurred_at", endExclusive.toISOString());
  if (error) throw error;

  const byMember = new Map<string, { count: number; gross: number }>();
  for (const row of data ?? []) {
    const cur = byMember.get(row.member_id) ?? { count: 0, gross: 0 };
    cur.count += 1;
    cur.gross += row.payout_amount;
    byMember.set(row.member_id, cur);
  }

  const names = await getMemberNames([...byMember.keys()]);
  const lines: PayrollPreviewLine[] = [...byMember.entries()]
    .map(([member_id, v]) => ({
      member_id,
      member_name: names.get(member_id) ?? "Unknown member",
      log_count: v.count,
      gross_amount: Math.round(v.gross * 100) / 100,
    }))
    .sort((a, b) => b.gross_amount - a.gross_amount);

  const total = lines.reduce((sum, l) => sum + l.gross_amount, 0);
  return { lines, total: Math.round(total * 100) / 100 };
}

export type Payslip = PayrollRunLine & {
  run_number: string;
  period_start: string;
  period_end: string;
  run_status: PayrollRunStatus;
};

/** The current member's payroll lines across every run (RLS scopes to self). */
export async function listMyPayslips(): Promise<Payslip[]> {
  const supabase = await createClient();

  const { data: lines } = await supabase
    .from("payroll_run_lines")
    .select("*")
    .order("created_at", { ascending: false });
  if (!lines || lines.length === 0) return [];

  const { data: runs } = await supabase
    .from("payroll_runs")
    .select("id, run_number, period_start, period_end, status")
    .in("id", [...new Set(lines.map((l) => l.payroll_run_id))]);

  const byRun = new Map((runs ?? []).map((r) => [r.id, r]));

  return lines
    .map((l) => {
      const run = byRun.get(l.payroll_run_id);
      if (!run) return null;
      return {
        ...l,
        run_number: run.run_number,
        period_start: run.period_start,
        period_end: run.period_end,
        run_status: run.status,
      } satisfies Payslip;
    })
    .filter((v): v is Payslip => v !== null);
}

export async function getPayrollAttention(): Promise<{
  draftRuns: number;
  unpaidFinalizedTotal: number;
}> {
  const supabase = await createClient();
  const [draft, finalized] = await Promise.all([
    supabase
      .from("payroll_runs")
      .select("id", { count: "exact", head: true })
      .eq("status", "DRAFT"),
    supabase
      .from("payroll_runs")
      .select("total_amount")
      .eq("status", "FINALIZED"),
  ]);
  return {
    draftRuns: draft.count ?? 0,
    unpaidFinalizedTotal: (finalized.data ?? []).reduce(
      (sum, r) => sum + r.total_amount,
      0,
    ),
  };
}

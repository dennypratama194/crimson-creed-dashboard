import "server-only";

import type {
  ItemUnit,
  MemberRank,
  MemberSubmissionStatus,
} from "@/lib/constants/enums";
import type { Tables } from "@/lib/database.types";
import {
  adminSubmissionMonthPayload,
  mySubmissionHistoryPayload,
  parseRpcPayload,
} from "@/lib/db/contracts";
import { pageBounds } from "@/lib/db/paging";
import { createClient } from "@/lib/supabase/server";

export type MaterialType = Tables<"submission_material_types">;

/** First day of the current month, `YYYY-MM-01`, in UTC. */
export function currentPeriodMonth(): string {
  const d = new Date();
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-01`;
}

/** `YYYY-MM` (month-input value) -> `YYYY-MM-01` (period_month date). */
export function monthParamToPeriod(month: string): string {
  return `${month}-01`;
}

export type SubmissionReceiver = { id: string; displayName: string };

/**
 * Active Super Admins a member can name as the PIC on a submission. Backed by
 * the `list_submission_receivers` RPC because RLS hides other members' rows from
 * a regular member.
 */
export async function listSubmissionReceivers(): Promise<SubmissionReceiver[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("list_submission_receivers");
  if (error) throw error;
  return (data ?? []).map((r) => ({ id: r.id, displayName: r.display_name }));
}

export async function getMaterialTypes(): Promise<MaterialType[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("submission_material_types")
    .select("*")
    .eq("active", true)
    .order("sort_order", { ascending: true })
    .order("id", { ascending: true });
  if (error) throw error;
  return data ?? [];
}

/**
 * The period row for a month, or null when nobody has opened that month yet —
 * a real state (periods are created lazily), not a failure. Failures throw.
 */
async function findPeriodId(periodMonth: string): Promise<string | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("submission_periods")
    .select("id")
    .eq("period_month", periodMonth)
    .maybeSingle();
  if (error) throw error;
  return data?.id ?? null;
}

/** materialTypeId -> target quantity for a month (0 when unset). */
export async function getMonthTargets(
  periodMonth: string,
): Promise<Record<string, number>> {
  const periodId = await findPeriodId(periodMonth);
  if (!periodId) return {};

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("submission_period_targets")
    .select("material_type_id, target_quantity")
    .eq("period_id", periodId);
  if (error) throw error;

  const out: Record<string, number> = {};
  for (const row of data ?? []) out[row.material_type_id] = row.target_quantity;
  return out;
}

// ── member: my submission for a month + history ────────────────────────────
export type MyMonthSubmission = {
  submission: Tables<"member_submissions"> | null;
  quantities: Record<string, number>;
};

export async function getMyMonthSubmission(
  periodMonth: string,
  memberId: string,
): Promise<MyMonthSubmission> {
  const periodId = await findPeriodId(periodMonth);
  if (!periodId) return { submission: null, quantities: {} };

  const supabase = await createClient();

  // Scope to the caller explicitly: RLS lets a Super Admin see every member's
  // row for the period, so `.maybeSingle()` would throw without this filter.
  const { data: submission, error } = await supabase
    .from("member_submissions")
    .select("*")
    .eq("period_id", periodId)
    .eq("member_id", memberId)
    .maybeSingle();
  if (error) throw error;
  if (!submission) return { submission: null, quantities: {} };

  // One submission carries one line per material type — a handful of rows.
  const { data: lines, error: linesError } = await supabase
    .from("member_submission_lines")
    .select("material_type_id, quantity")
    .eq("member_submission_id", submission.id);
  if (linesError) throw linesError;

  const quantities: Record<string, number> = {};
  for (const line of lines ?? []) {
    quantities[line.material_type_id] = line.quantity;
  }
  return { submission, quantities };
}

export type MyHistoryRow = {
  periodMonth: string;
  submission: Tables<"member_submissions">;
  quantities: Record<string, number>;
};

export const SUBMISSION_HISTORY_PAGE_SIZE = 12;

/**
 * One page of the caller's own submission history, newest month first. Paged
 * and counted in SQL by `my_submission_history()` (0080), which is scoped to
 * the session's member — there is no member id to pass, or to widen.
 */
export async function listMyMemberSubmissions(options: {
  page?: number | string;
}): Promise<{
  rows: MyHistoryRow[];
  total: number;
  page: number;
  pageSize: number;
}> {
  const supabase = await createClient();
  const pageSize = SUBMISSION_HISTORY_PAGE_SIZE;
  const { page, from } = pageBounds(options.page, pageSize);

  const { data, error } = await supabase.rpc("my_submission_history", {
    p_limit: pageSize,
    p_offset: from,
  });
  if (error) throw error;

  const payload = parseRpcPayload(
    mySubmissionHistoryPayload,
    data,
    "my_submission_history",
  );
  return { rows: payload.rows, total: payload.total, page, pageSize };
}

export type MemberSubmissionAlert = {
  periodMonth: string;
  state: "MISSING" | MemberSubmissionStatus;
};

/**
 * Closed months the current member still owes a CONFIRMED submission for
 * (Phase 17b order gate). Empty unless a Super Admin has switched the gate on.
 * Oldest month first, as `YYYY-MM-01`.
 */
export async function getMySubmissionDebt(): Promise<string[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("my_submission_debt");
  if (error) throw error;
  return [...(data ?? [])].sort();
}

export type SubmissionGate = {
  enabled: boolean;
  /** First day of the reach-back month, `YYYY-MM-01`, or null when unset. */
  startMonth: string | null;
};

/** The order-gate toggle + reach-back month (Super Admin control). */
export async function getSubmissionGate(): Promise<SubmissionGate> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("organization_settings")
    .select("submission_gate_enabled, submission_obligation_start_month")
    .eq("id", true)
    .single();
  if (error) throw error;
  return {
    enabled: data.submission_gate_enabled,
    startMonth: data.submission_obligation_start_month,
  };
}

// ── admin: month grid ─────────────────────────────────────────────────────
export type AdminMaterialColumn = {
  id: string;
  code: string;
  name: string;
  unit: ItemUnit;
  target: number;
};

export type AdminSubmissionRow = {
  memberId: string;
  memberName: string;
  rank: MemberRank;
  active: boolean;
  submissionId: string | null;
  status: MemberSubmissionStatus | null;
  submittedAt: string | null;
  confirmedAt: string | null;
  note: string | null;
  reviewNote: string | null;
  receivedById: string | null;
  receivedByName: string | null;
  quantities: Record<string, number>;
};

export type AdminSubmissionMonth = {
  periodMonth: string;
  hasPeriod: boolean;
  materials: AdminMaterialColumn[];
  rows: AdminSubmissionRow[];
  totals: Record<string, number>;
  counts: {
    members: number;
    confirmed: number;
    pending: number;
    rejected: number;
    missing: number;
  };
};

/**
 * The Super Admin month grid. Rows, per-material totals and status counts are
 * built in SQL by `admin_submission_month()` (0080) and arrive as one jsonb
 * value, so neither the lines nor the totals can be cut short by the PostgREST
 * row cap however many members submit.
 */
export async function getAdminSubmissionMonth(
  periodMonth: string,
): Promise<AdminSubmissionMonth> {
  const supabase = await createClient();

  const [materials, { data, error }] = await Promise.all([
    getMaterialTypes(),
    supabase.rpc("admin_submission_month", { p_period_month: periodMonth }),
  ]);
  if (error) throw error;

  const payload = parseRpcPayload(
    adminSubmissionMonthPayload,
    data,
    "admin_submission_month",
  );

  const columns: AdminMaterialColumn[] = materials.map((m) => ({
    id: m.id,
    code: m.code,
    name: m.name,
    unit: m.unit,
    target: payload.targets[m.id] ?? 0,
  }));

  // Totals are reported for the material columns on screen, as before.
  const totals: Record<string, number> = {};
  for (const col of columns) totals[col.id] = payload.totals[col.id] ?? 0;

  return {
    periodMonth,
    hasPeriod: payload.hasPeriod,
    materials: columns,
    rows: payload.rows.map((r) => ({
      ...r,
      memberName: r.memberName ?? "Former member",
      rank: r.rank ?? "SOLDIER",
    })),
    totals,
    counts: payload.counts,
  };
}

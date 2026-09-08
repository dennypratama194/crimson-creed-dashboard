import "server-only";

import type {
  ItemUnit,
  MemberRank,
  MemberSubmissionStatus,
} from "@/lib/constants/enums";
import type { Tables } from "@/lib/database.types";
import { getMemberNames } from "@/lib/db/members";
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
    .order("sort_order", { ascending: true });
  if (error) throw error;
  return data ?? [];
}

/** materialTypeId -> quantity, for a set of submissions. */
async function quantitiesBySubmission(
  submissionIds: string[],
): Promise<Map<string, Record<string, number>>> {
  const out = new Map<string, Record<string, number>>();
  if (submissionIds.length === 0) return out;

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("member_submission_lines")
    .select("member_submission_id, material_type_id, quantity")
    .in("member_submission_id", submissionIds);
  if (error) throw error;

  for (const line of data ?? []) {
    const bucket = out.get(line.member_submission_id) ?? {};
    bucket[line.material_type_id] = line.quantity;
    out.set(line.member_submission_id, bucket);
  }
  return out;
}

/** materialTypeId -> target quantity for a month (0 when unset). */
export async function getMonthTargets(
  periodMonth: string,
): Promise<Record<string, number>> {
  const supabase = await createClient();
  const { data: period } = await supabase
    .from("submission_periods")
    .select("id")
    .eq("period_month", periodMonth)
    .maybeSingle();
  if (!period) return {};

  const { data } = await supabase
    .from("submission_period_targets")
    .select("material_type_id, target_quantity")
    .eq("period_id", period.id);

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
  const supabase = await createClient();

  const { data: period } = await supabase
    .from("submission_periods")
    .select("id")
    .eq("period_month", periodMonth)
    .maybeSingle();
  if (!period) return { submission: null, quantities: {} };

  // Scope to the caller explicitly: RLS lets a Super Admin see every member's
  // row for the period, so `.maybeSingle()` would throw without this filter.
  const { data: submission, error } = await supabase
    .from("member_submissions")
    .select("*")
    .eq("period_id", period.id)
    .eq("member_id", memberId)
    .maybeSingle();
  if (error) throw error;
  if (!submission) return { submission: null, quantities: {} };

  const quantities = await quantitiesBySubmission([submission.id]);
  return { submission, quantities: quantities.get(submission.id) ?? {} };
}

export type MyHistoryRow = {
  periodMonth: string;
  submission: Tables<"member_submissions">;
  quantities: Record<string, number>;
};

export async function listMyMemberSubmissions(
  memberId: string,
): Promise<MyHistoryRow[]> {
  const supabase = await createClient();

  // Scope to the caller explicitly — a Super Admin's RLS view is every member's
  // rows, not just their own.
  const { data: submissions, error } = await supabase
    .from("member_submissions")
    .select("*")
    .eq("member_id", memberId)
    .order("submitted_at", { ascending: false });
  if (error) throw error;
  if (!submissions || submissions.length === 0) return [];

  const periodIds = [...new Set(submissions.map((s) => s.period_id))];
  const [{ data: periods }, quantities] = await Promise.all([
    supabase
      .from("submission_periods")
      .select("id, period_month")
      .in("id", periodIds),
    quantitiesBySubmission(submissions.map((s) => s.id)),
  ]);

  const monthByPeriod = new Map(
    (periods ?? []).map((p) => [p.id, p.period_month]),
  );

  return submissions
    .map((submission) => ({
      periodMonth: monthByPeriod.get(submission.period_id) ?? "",
      submission,
      quantities: quantities.get(submission.id) ?? {},
    }))
    .sort((a, b) => b.periodMonth.localeCompare(a.periodMonth));
}

export type MemberSubmissionAlert = {
  periodMonth: string;
  state: "MISSING" | MemberSubmissionStatus;
};

/** Current-month status for the logged-in member — drives the dashboard nag. */
export async function getMemberSubmissionAlert(
  memberId: string,
): Promise<MemberSubmissionAlert> {
  const periodMonth = currentPeriodMonth();
  const { submission } = await getMyMonthSubmission(periodMonth, memberId);
  return { periodMonth, state: submission ? submission.status : "MISSING" };
}

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

export async function getAdminSubmissionMonth(
  periodMonth: string,
): Promise<AdminSubmissionMonth> {
  const supabase = await createClient();

  const [materials, periodRes, membersRes] = await Promise.all([
    getMaterialTypes(),
    supabase
      .from("submission_periods")
      .select("id")
      .eq("period_month", periodMonth)
      .maybeSingle(),
    supabase
      .from("members")
      .select("id, display_name, rank")
      .eq("status", "ACTIVE")
      .order("display_name", { ascending: true }),
  ]);

  const period = periodRes.data;
  const activeMembers = membersRes.data ?? [];

  const [targetsRes, submissionsRes] = await Promise.all([
    period
      ? supabase
          .from("submission_period_targets")
          .select("material_type_id, target_quantity")
          .eq("period_id", period.id)
      : Promise.resolve({ data: null }),
    period
      ? supabase
          .from("member_submissions")
          .select(
            "id, member_id, status, submitted_at, confirmed_at, note, review_note, received_by, received_by_name",
          )
          .eq("period_id", period.id)
      : Promise.resolve({ data: null }),
  ]);

  const targetByMaterial = new Map(
    (targetsRes.data ?? []).map((t) => [t.material_type_id, t.target_quantity]),
  );
  const columns: AdminMaterialColumn[] = materials.map((m) => ({
    id: m.id,
    code: m.code,
    name: m.name,
    unit: m.unit,
    target: targetByMaterial.get(m.id) ?? 0,
  }));

  const submissions = submissionsRes.data ?? [];
  const submissionByMember = new Map(submissions.map((s) => [s.member_id, s]));
  const quantities = await quantitiesBySubmission(submissions.map((s) => s.id));

  const activeIds = new Set(activeMembers.map((m) => m.id));
  const stragglerIds = submissions
    .map((s) => s.member_id)
    .filter((id) => !activeIds.has(id));
  const stragglerNames = await getMemberNames(stragglerIds);

  const rows: AdminSubmissionRow[] = activeMembers.map((m) => {
    const s = submissionByMember.get(m.id);
    return {
      memberId: m.id,
      memberName: m.display_name,
      rank: m.rank,
      active: true,
      submissionId: s?.id ?? null,
      status: s?.status ?? null,
      submittedAt: s?.submitted_at ?? null,
      confirmedAt: s?.confirmed_at ?? null,
      note: s?.note ?? null,
      reviewNote: s?.review_note ?? null,
      receivedById: s?.received_by ?? null,
      receivedByName: s?.received_by_name ?? null,
      quantities: s ? (quantities.get(s.id) ?? {}) : {},
    };
  });

  for (const id of stragglerIds) {
    const s = submissionByMember.get(id)!;
    rows.push({
      memberId: id,
      memberName: stragglerNames.get(id) ?? "Former member",
      rank: "SOLDIER",
      active: false,
      submissionId: s.id,
      status: s.status,
      submittedAt: s.submitted_at,
      confirmedAt: s.confirmed_at,
      note: s.note,
      reviewNote: s.review_note,
      receivedById: s.received_by ?? null,
      receivedByName: s.received_by_name ?? null,
      quantities: quantities.get(s.id) ?? {},
    });
  }

  const totals: Record<string, number> = {};
  for (const col of columns) {
    totals[col.id] = rows.reduce(
      (sum, r) => sum + (r.quantities[col.id] ?? 0),
      0,
    );
  }

  const counts = {
    members: rows.length,
    confirmed: rows.filter((r) => r.status === "CONFIRMED").length,
    pending: rows.filter((r) => r.status === "PENDING").length,
    rejected: rows.filter((r) => r.status === "REJECTED").length,
    missing: rows.filter((r) => r.status === null).length,
  };

  return {
    periodMonth,
    hasPeriod: !!period,
    materials: columns,
    rows,
    totals,
    counts,
  };
}

/** Distinct months that have a period row, newest first, as `YYYY-MM-01`. */
export async function listSubmissionMonths(): Promise<string[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("submission_periods")
    .select("period_month")
    .order("period_month", { ascending: false });
  if (error) throw error;

  const months = (data ?? []).map((r) => r.period_month);
  const current = currentPeriodMonth();
  if (!months.includes(current)) months.unshift(current);
  return months;
}

export async function getPendingSubmissionCount(): Promise<number> {
  const supabase = await createClient();
  const { count } = await supabase
    .from("member_submissions")
    .select("id", { count: "exact", head: true })
    .eq("status", "PENDING");
  return count ?? 0;
}

export type SubmissionAttention = {
  toReview: number;
  notSubmittedThisMonth: number;
};

/** Counts for the admin dashboard: pending reviews + who still owes this month. */
export async function getSubmissionAttention(): Promise<SubmissionAttention> {
  const supabase = await createClient();
  const periodMonth = currentPeriodMonth();

  const [pending, activeMembers, period] = await Promise.all([
    getPendingSubmissionCount(),
    supabase
      .from("members")
      .select("id", { count: "exact", head: true })
      .eq("status", "ACTIVE"),
    supabase
      .from("submission_periods")
      .select("id")
      .eq("period_month", periodMonth)
      .maybeSingle(),
  ]);

  const activeCount = activeMembers.count ?? 0;
  let confirmed = 0;
  if (period.data) {
    const { count } = await supabase
      .from("member_submissions")
      .select("id", { count: "exact", head: true })
      .eq("period_id", period.data.id)
      .eq("status", "CONFIRMED");
    confirmed = count ?? 0;
  }

  return {
    toReview: pending,
    notSubmittedThisMonth: Math.max(0, activeCount - confirmed),
  };
}

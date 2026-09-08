import type { Metadata } from "next";
import {
  CircleAlert,
  CircleCheck,
  Clock,
  Lock,
  LockOpen,
  Recycle,
  SlidersHorizontal,
} from "lucide-react";

import {
  MEMBER_RANK_LABEL,
  MEMBER_SUBMISSION_MISSING_LABEL,
  MEMBER_SUBMISSION_STATUS_LABEL,
} from "@/lib/constants/labels";
import { MEMBER_SUBMISSION_STATUS_TONE } from "@/lib/constants/status-config";
import {
  currentPeriodMonth,
  getAdminSubmissionMonth,
  getSubmissionGate,
  monthParamToPeriod,
} from "@/lib/db/submissions";
import { formatMonth, formatQuantity } from "@/lib/format";
import { cn } from "@/lib/utils";
import { EmptyState } from "@/components/patterns/empty-state";
import { KpiCard } from "@/components/patterns/kpi-card";
import { PageHeader } from "@/components/patterns/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { EditGateDialog } from "@/app/(app)/admin/submissions/edit-gate-dialog";
import { EditTargetsDialog } from "@/app/(app)/admin/submissions/edit-targets-dialog";
import { MonthPicker } from "@/app/(app)/admin/submissions/month-picker";
import { ReviewSubmissionDialog } from "@/app/(app)/admin/submissions/review-submission-dialog";

export const metadata: Metadata = { title: "Monthly submissions" };

function one(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function thisMonthParam(): string {
  return currentPeriodMonth().slice(0, 7);
}

export default async function AdminSubmissionsPage({
  searchParams,
}: PageProps<"/admin/submissions">) {
  const sp = await searchParams;
  const nowMonth = thisMonthParam();
  const rawMonth = one(sp.month);
  const monthParam =
    /^\d{4}-\d{2}$/.test(rawMonth ?? "") && (rawMonth as string) <= nowMonth
      ? (rawMonth as string)
      : nowMonth;

  const periodMonth = monthParamToPeriod(monthParam);
  const monthLabel = formatMonth(periodMonth);
  const [data, gate] = await Promise.all([
    getAdminSubmissionMonth(periodMonth),
    getSubmissionGate(),
  ]);

  const editTargetsTrigger = (
    <Button variant="secondary">
      <SlidersHorizontal aria-hidden />
      Edit targets
    </Button>
  );

  const GateIcon = gate.enabled ? Lock : LockOpen;
  const gateTrigger = (
    <Button variant="secondary">
      <GateIcon aria-hidden />
      Order gate:{" "}
      {gate.enabled
        ? `on${gate.startMonth ? ` · from ${formatMonth(gate.startMonth)}` : ""}`
        : "off"}
    </Button>
  );

  return (
    <>
      <PageHeader
        title="Monthly submissions"
        description="What each member handed in — metal scrap, empty bottles and cans."
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <EditGateDialog
              enabled={gate.enabled}
              startMonth={gate.startMonth ? gate.startMonth.slice(0, 7) : null}
              maxMonth={nowMonth}
              trigger={gateTrigger}
            />
            <EditTargetsDialog
              periodMonthParam={monthParam}
              monthLabel={monthLabel}
              materials={data.materials}
              trigger={editTargetsTrigger}
            />
          </div>
        }
      />

      <div className="flex flex-col gap-6">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-sm font-medium text-muted-foreground">
            {monthParam === nowMonth ? "This month" : monthLabel}
          </h2>
          <MonthPicker value={monthParam} max={nowMonth} />
        </div>

        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          <KpiCard
            label="Confirmed"
            value={data.counts.confirmed}
            icon={CircleCheck}
            hint={`of ${data.counts.members} members`}
          />
          <KpiCard
            label="Awaiting review"
            value={data.counts.pending}
            icon={Clock}
          />
          <KpiCard
            label="Rejected"
            value={data.counts.rejected}
            icon={CircleAlert}
          />
          <KpiCard
            label="Not submitted"
            value={data.counts.missing}
            icon={Recycle}
          />
        </div>

        {data.rows.length === 0 ? (
          <EmptyState
            icon={Recycle}
            title="No active members"
            description="Add members before tracking monthly submissions."
          />
        ) : (
          <Table className="min-w-[720px]">
            <TableHeader>
              <TableRow>
                <TableHead className="w-12">No.</TableHead>
                <TableHead>Member</TableHead>
                {data.materials.map((m) => (
                  <TableHead key={m.id} className="text-right">
                    <span className="block">{m.name}</span>
                    {m.target > 0 ? (
                      <span className="block text-xs font-normal text-muted-foreground">
                        target {formatQuantity(m.target)}
                      </span>
                    ) : null}
                  </TableHead>
                ))}
                <TableHead>Status</TableHead>
                <TableHead className="w-24" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.rows.map((row, i) => {
                const missing = row.status === null;
                return (
                  <TableRow
                    key={row.memberId}
                    className={cn(missing && "text-muted-foreground")}
                  >
                    <TableCell className="tabular-nums">{i + 1}</TableCell>
                    <TableCell className="whitespace-nowrap">
                      <span
                        className={cn(
                          "text-foreground",
                          !missing && "font-medium",
                        )}
                      >
                        {row.memberName}
                      </span>
                      <span className="ml-2 text-xs text-muted-foreground">
                        {MEMBER_RANK_LABEL[row.rank]}
                        {row.active ? "" : " · inactive"}
                      </span>
                    </TableCell>
                    {data.materials.map((m) => {
                      const value = row.quantities[m.id] ?? 0;
                      const short =
                        !missing && m.target > 0 && value < m.target;
                      return (
                        <TableCell
                          key={m.id}
                          className={cn(
                            "text-right tabular-nums",
                            short && "text-tone-warning-fg",
                          )}
                        >
                          {missing ? "—" : formatQuantity(value)}
                        </TableCell>
                      );
                    })}
                    <TableCell>
                      {row.status ? (
                        <Badge tone={MEMBER_SUBMISSION_STATUS_TONE[row.status]}>
                          {MEMBER_SUBMISSION_STATUS_LABEL[row.status]}
                        </Badge>
                      ) : (
                        <Badge tone="gray">
                          {MEMBER_SUBMISSION_MISSING_LABEL}
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      {row.submissionId &&
                      (row.status === "PENDING" ||
                        row.status === "CONFIRMED") ? (
                        <ReviewSubmissionDialog
                          submissionId={row.submissionId}
                          memberName={row.memberName}
                          monthLabel={monthLabel}
                          materials={data.materials}
                          quantities={row.quantities}
                          alreadyConfirmed={row.status === "CONFIRMED"}
                          trigger={
                            <Button variant="ghost" size="sm">
                              {row.status === "CONFIRMED" ? "Adjust" : "Review"}
                            </Button>
                          }
                        />
                      ) : row.status === "REJECTED" ? (
                        <span className="text-xs text-muted-foreground">
                          Awaiting resubmit
                        </span>
                      ) : null}
                    </TableCell>
                  </TableRow>
                );
              })}
              <TableRow className="border-t-2 font-semibold">
                <TableCell />
                <TableCell>Total</TableCell>
                {data.materials.map((m) => (
                  <TableCell key={m.id} className="text-right tabular-nums">
                    {formatQuantity(data.totals[m.id] ?? 0)}
                  </TableCell>
                ))}
                <TableCell />
                <TableCell />
              </TableRow>
            </TableBody>
          </Table>
        )}
      </div>
    </>
  );
}

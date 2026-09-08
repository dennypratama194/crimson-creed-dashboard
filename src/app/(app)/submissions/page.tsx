import type { Metadata } from "next";
import { CircleAlert, CircleCheck, Clock, Lock, Recycle } from "lucide-react";

import { requireActiveMember } from "@/lib/auth/session";
import { MEMBER_SUBMISSION_STATUS_LABEL } from "@/lib/constants/labels";
import { MEMBER_SUBMISSION_STATUS_TONE } from "@/lib/constants/status-config";
import {
  currentPeriodMonth,
  getMaterialTypes,
  getMonthTargets,
  getMyMonthSubmission,
  getMySubmissionDebt,
  listMyMemberSubmissions,
  listSubmissionReceivers,
} from "@/lib/db/submissions";
import { formatDate, formatMonth, formatQuantity } from "@/lib/format";
import { EmptyState } from "@/components/patterns/empty-state";
import { PageHeader } from "@/components/patterns/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { SubmitMaterialsDialog } from "@/app/(app)/submissions/submit-materials-dialog";

export const metadata: Metadata = { title: "Monthly submissions" };

export default async function SubmissionsPage() {
  const periodMonth = currentPeriodMonth();
  const monthLabel = formatMonth(periodMonth);
  const member = await requireActiveMember();

  const [
    materials,
    { submission, quantities },
    targets,
    history,
    debtMonths,
    receivers,
  ] = await Promise.all([
    getMaterialTypes(),
    getMyMonthSubmission(periodMonth, member.id),
    getMonthTargets(periodMonth),
    listMyMemberSubmissions(member.id),
    getMySubmissionDebt(),
    listSubmissionReceivers(),
  ]);

  const state = submission ? submission.status : "MISSING";
  const canEdit = state !== "CONFIRMED";
  const mode =
    state === "MISSING"
      ? "submit"
      : state === "REJECTED"
        ? "resubmit"
        : "update";

  const banner = {
    MISSING: {
      icon: CircleAlert,
      tone: "warning" as const,
      title: `Your ${monthLabel} submission is due`,
      body: "Log how much metal scrap, empty bottles and cans you handed in this month.",
    },
    PENDING: {
      icon: Clock,
      tone: "info" as const,
      title: `Your ${monthLabel} submission is awaiting review`,
      body: "A Super Admin will confirm your figures. You can still update them until then.",
    },
    REJECTED: {
      icon: CircleAlert,
      tone: "error" as const,
      title: `Your ${monthLabel} submission was rejected`,
      body: submission?.review_note
        ? `Reason: ${submission.review_note}`
        : "Please review and resubmit.",
    },
    CONFIRMED: {
      icon: CircleCheck,
      tone: "success" as const,
      title: `Your ${monthLabel} submission is confirmed`,
      body: "Nothing more to do this month.",
    },
  }[state];

  const BannerIcon = banner.icon;
  const submitLabel =
    state === "MISSING"
      ? "Submit this month"
      : state === "REJECTED"
        ? "Resubmit"
        : "Update submission";

  return (
    <>
      <PageHeader
        title="Monthly submissions"
        description="Hand in your metal scrap, empty bottles and cans each month."
      />

      <div className="flex flex-col gap-6">
        {debtMonths.length > 0 ? (
          <Card className="flex flex-col gap-4 border-l-4 border-l-tone-error-fg p-5">
            <div className="flex items-start gap-3">
              <Lock
                className="mt-0.5 size-5 shrink-0 text-tone-error-fg"
                aria-hidden
              />
              <div className="flex flex-col gap-0.5">
                <p className="font-medium">Ordering is locked</p>
                <p className="text-sm text-muted-foreground">
                  You have {debtMonths.length} earlier{" "}
                  {debtMonths.length === 1 ? "month" : "months"} with no
                  confirmed hand-in. Submit{" "}
                  {debtMonths.length === 1 ? "it" : "them"} below — you can
                  order again once a Super Admin confirms each one.
                </p>
              </div>
            </div>
            <ul className="flex flex-col gap-2">
              {debtMonths.map((month) => (
                <li
                  key={month}
                  className="flex items-center justify-between gap-3 rounded-md border border-border px-3 py-2"
                >
                  <span className="font-medium">{formatMonth(month)}</span>
                  <SubmitMaterialsDialog
                    materials={materials}
                    targets={{}}
                    initialQuantities={{}}
                    receivers={receivers}
                    monthLabel={formatMonth(month)}
                    mode="submit"
                    periodMonth={month.slice(0, 7)}
                    trigger={
                      <Button size="sm" variant="secondary">
                        <Recycle aria-hidden />
                        Submit for {formatMonth(month)}
                      </Button>
                    }
                  />
                </li>
              ))}
            </ul>
          </Card>
        ) : null}

        <Card
          className={cn(
            "flex flex-col gap-3 border-l-4 p-5 sm:flex-row sm:items-center sm:justify-between",
            banner.tone === "warning" && "border-l-tone-warning-fg",
            banner.tone === "info" && "border-l-tone-info-fg",
            banner.tone === "error" && "border-l-tone-error-fg",
            banner.tone === "success" && "border-l-tone-success-fg",
          )}
        >
          <div className="flex items-start gap-3">
            <BannerIcon
              className={cn(
                "mt-0.5 size-5 shrink-0",
                banner.tone === "warning" && "text-tone-warning-fg",
                banner.tone === "info" && "text-tone-info-fg",
                banner.tone === "error" && "text-tone-error-fg",
                banner.tone === "success" && "text-tone-success-fg",
              )}
              aria-hidden
            />
            <div className="flex flex-col gap-0.5">
              <p className="font-medium">{banner.title}</p>
              <p className="text-sm text-muted-foreground">{banner.body}</p>
            </div>
          </div>
          {canEdit ? (
            <SubmitMaterialsDialog
              materials={materials}
              targets={targets}
              initialQuantities={quantities}
              receivers={receivers}
              initialReceivedById={submission?.received_by ?? undefined}
              monthLabel={monthLabel}
              mode={mode}
              trigger={
                <Button className="shrink-0">
                  <Recycle aria-hidden />
                  {submitLabel}
                </Button>
              }
            />
          ) : null}
        </Card>

        <section className="flex flex-col gap-3">
          <h2 className="text-sm font-semibold text-muted-foreground">
            History
          </h2>
          {history.length === 0 ? (
            <EmptyState
              icon={Recycle}
              title="No submissions yet"
              description="Your monthly hand-ins will show up here once you submit."
            />
          ) : (
            <Table className="min-w-[640px]">
              <TableHeader>
                <TableRow>
                  <TableHead>Month</TableHead>
                  {materials.map((m) => (
                    <TableHead key={m.id} className="text-right">
                      {m.code}
                    </TableHead>
                  ))}
                  <TableHead>Status</TableHead>
                  <TableHead>Received by</TableHead>
                  <TableHead>Submitted</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {history.map((row) => (
                  <TableRow key={row.submission.id}>
                    <TableCell className="font-medium whitespace-nowrap">
                      {row.periodMonth ? formatMonth(row.periodMonth) : "—"}
                    </TableCell>
                    {materials.map((m) => (
                      <TableCell key={m.id} className="text-right tabular-nums">
                        {formatQuantity(row.quantities[m.id] ?? 0)}
                      </TableCell>
                    ))}
                    <TableCell>
                      <Badge
                        tone={
                          MEMBER_SUBMISSION_STATUS_TONE[row.submission.status]
                        }
                      >
                        {MEMBER_SUBMISSION_STATUS_LABEL[row.submission.status]}
                      </Badge>
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-muted-foreground">
                      {row.submission.received_by_name ?? "—"}
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-muted-foreground">
                      {formatDate(row.submission.submitted_at)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </section>
      </div>
    </>
  );
}

import type { Metadata } from "next";
import Link from "next/link";
import { CircleAlert, CircleCheck, Clock, Lock, Recycle } from "lucide-react";

import { requireActiveMember } from "@/lib/auth/session";
import {
  MEMBER_SUBMISSION_MISSING_LABEL,
  MEMBER_SUBMISSION_STATUS_LABEL,
} from "@/lib/constants/labels";
import { MEMBER_SUBMISSION_STATUS_TONE } from "@/lib/constants/status-config";
import {
  currentPeriodMonth,
  getMaterialTypes,
  getMonthTargets,
  getMyMonthSubmission,
  getMyOwedSubmissions,
  listMyMemberSubmissions,
  listSubmissionReceivers,
  monthParamToPeriod,
} from "@/lib/db/submissions";
import { formatDate, formatMonth, formatQuantity } from "@/lib/format";
import { EmptyState } from "@/components/patterns/empty-state";
import { PageHeader } from "@/components/patterns/page-header";
import { Pagination } from "@/components/patterns/pagination";
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
import { MonthPicker } from "@/app/(app)/submissions/month-picker";
import { SubmitMaterialsDialog } from "@/app/(app)/submissions/submit-materials-dialog";

export const metadata: Metadata = { title: "Monthly submissions" };

const BANNER_TONE = {
  neutral: { border: "border-l-border", icon: "text-muted-foreground" },
  warning: {
    border: "border-l-tone-warning-fg",
    icon: "text-tone-warning-fg",
  },
  info: { border: "border-l-tone-info-fg", icon: "text-tone-info-fg" },
  error: { border: "border-l-tone-error-fg", icon: "text-tone-error-fg" },
  success: {
    border: "border-l-tone-success-fg",
    icon: "text-tone-success-fg",
  },
} as const;

function one(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

/** `YYYY-MM-01` -> `/submissions?month=YYYY-MM`. */
function monthHref(periodMonth: string) {
  return `/submissions?month=${periodMonth.slice(0, 7)}` as const;
}

export default async function SubmissionsPage({
  searchParams,
}: PageProps<"/submissions">) {
  const sp = await searchParams;
  const pageParam = one(sp.page);
  const nowMonth = currentPeriodMonth().slice(0, 7);
  const rawMonth = one(sp.month);
  const monthParam =
    /^\d{4}-\d{2}$/.test(rawMonth ?? "") && (rawMonth as string) <= nowMonth
      ? (rawMonth as string)
      : nowMonth;
  const periodMonth = monthParamToPeriod(monthParam);
  const isCurrentMonth = monthParam === nowMonth;
  const monthLabel = formatMonth(periodMonth);
  const member = await requireActiveMember();

  const [
    materials,
    { submission, quantities },
    targets,
    history,
    owed,
    receivers,
  ] = await Promise.all([
    getMaterialTypes(),
    getMyMonthSubmission(periodMonth, member.id),
    getMonthTargets(periodMonth),
    listMyMemberSubmissions({ page: pageParam }),
    getMyOwedSubmissions(),
    listSubmissionReceivers(),
  ]);

  const state = submission ? submission.status : "MISSING";
  const owesThisMonth = owed.some((o) => o.periodMonth === periodMonth);
  // Owed months not yet handed in (nothing filed, or rejected) keep the
  // current month closed until they are — submit_material_submission refuses
  // it too (0084). A PENDING owed month no longer holds it back.
  const waitingOn =
    isCurrentMonth && state !== "CONFIRMED"
      ? (owed.find((o) => o.state !== "PENDING") ?? null)
      : null;
  // Open to (re)submit: the current month with nothing owed ahead of it, or
  // a past month the member still owes. Any other past month is read-only.
  const canEdit =
    state !== "CONFIRMED" &&
    (isCurrentMonth ? waitingOn === null : owesThisMonth);
  const mode =
    state === "MISSING"
      ? "submit"
      : state === "REJECTED"
        ? "resubmit"
        : "update";

  const banner = waitingOn
    ? {
        icon: Lock,
        tone: "warning" as const,
        title: `Hand in ${formatMonth(waitingOn.periodMonth)} first`,
        body: `You can submit ${monthLabel} once every earlier month is handed in.`,
      }
    : {
        MISSING: isCurrentMonth
          ? {
              icon: CircleAlert,
              tone: "warning" as const,
              title: `Your ${monthLabel} submission is due`,
              body: "Log how much metal scrap, empty bottles and cans you handed in this month.",
            }
          : owesThisMonth
            ? {
                icon: CircleAlert,
                tone: "warning" as const,
                title: `Your ${monthLabel} submission is overdue`,
                body: "Hand it in now — ordering stays locked until a Super Admin confirms it.",
              }
            : {
                icon: Recycle,
                tone: "neutral" as const,
                title: `No ${monthLabel} submission`,
                body: "This month is closed — there is nothing to hand in for it.",
              },
        PENDING: {
          icon: Clock,
          tone: "info" as const,
          title: `Your ${monthLabel} submission is awaiting review`,
          body: canEdit
            ? "A Super Admin will confirm your figures. You can still update them until then."
            : "A Super Admin will confirm your figures.",
        },
        REJECTED: {
          icon: CircleAlert,
          tone: "error" as const,
          title: `Your ${monthLabel} submission was rejected`,
          body: submission?.review_note
            ? `Reason: ${submission.review_note}`
            : canEdit
              ? "Please review and resubmit."
              : "This month is closed.",
        },
        CONFIRMED: {
          icon: CircleCheck,
          tone: "success" as const,
          title: `Your ${monthLabel} submission is confirmed`,
          body: isCurrentMonth
            ? "Nothing more to do this month."
            : "Nothing more to do for this month.",
        },
      }[state];

  const BannerIcon = banner.icon;
  const bannerTone = BANNER_TONE[banner.tone];
  const submitLabel =
    state === "MISSING"
      ? isCurrentMonth
        ? "Submit this month"
        : `Submit for ${monthLabel}`
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
        {owed.length > 0 ? (
          <Card className="flex flex-col gap-4 border-l-4 border-l-tone-error-fg p-5">
            <div className="flex items-start gap-3">
              <Lock
                className="mt-0.5 size-5 shrink-0 text-tone-error-fg"
                aria-hidden
              />
              <div className="flex flex-col gap-0.5">
                <p className="font-medium">Ordering is locked</p>
                <p className="text-sm text-muted-foreground">
                  You have {owed.length} earlier{" "}
                  {owed.length === 1 ? "month" : "months"} with no confirmed
                  hand-in. Hand {owed.length === 1 ? "it" : "them"} in before
                  this month&apos;s — you can order again once a Super Admin
                  confirms each one.
                </p>
              </div>
            </div>
            <ul className="flex flex-col gap-2">
              {owed.map((o) => {
                const selected = o.periodMonth === periodMonth;
                return (
                  <li
                    key={o.periodMonth}
                    aria-current={selected ? "true" : undefined}
                    className={cn(
                      "flex items-center justify-between gap-3 rounded-md border border-border px-3 py-2",
                      selected && "border-ring",
                    )}
                  >
                    <span className="flex items-center gap-2">
                      <span className="font-medium">
                        {formatMonth(o.periodMonth)}
                      </span>
                      <Badge
                        tone={
                          o.state === "MISSING"
                            ? "gray"
                            : MEMBER_SUBMISSION_STATUS_TONE[o.state]
                        }
                      >
                        {o.state === "MISSING"
                          ? MEMBER_SUBMISSION_MISSING_LABEL
                          : MEMBER_SUBMISSION_STATUS_LABEL[o.state]}
                      </Badge>
                    </span>
                    {selected ? (
                      <span className="text-xs text-muted-foreground">
                        Viewing
                      </span>
                    ) : (
                      <Button asChild size="sm" variant="secondary">
                        <Link href={monthHref(o.periodMonth)}>Open</Link>
                      </Button>
                    )}
                  </li>
                );
              })}
            </ul>
          </Card>
        ) : null}

        <section className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-sm font-semibold text-muted-foreground">
              {isCurrentMonth ? "This month" : monthLabel}
            </h2>
            <MonthPicker value={monthParam} max={nowMonth} />
          </div>

          <Card
            className={cn(
              "flex flex-col gap-3 border-l-4 p-5 sm:flex-row sm:items-center sm:justify-between",
              bannerTone.border,
            )}
          >
            <div className="flex items-start gap-3">
              <BannerIcon
                className={cn("mt-0.5 size-5 shrink-0", bannerTone.icon)}
                aria-hidden
              />
              <div className="flex flex-col gap-0.5">
                <p className="font-medium">{banner.title}</p>
                <p className="text-sm text-muted-foreground">{banner.body}</p>
              </div>
            </div>
            {canEdit ? (
              <SubmitMaterialsDialog
                // Remount per month so the form starts from that month's figures.
                key={monthParam}
                materials={materials}
                targets={targets}
                initialQuantities={quantities}
                receivers={receivers}
                initialReceivedById={submission?.received_by ?? undefined}
                monthLabel={monthLabel}
                mode={mode}
                periodMonth={isCurrentMonth ? undefined : monthParam}
                trigger={
                  <Button className="shrink-0">
                    <Recycle aria-hidden />
                    {submitLabel}
                  </Button>
                }
              />
            ) : waitingOn ? (
              <Button asChild variant="secondary" className="shrink-0">
                <Link href={monthHref(waitingOn.periodMonth)}>
                  Go to {formatMonth(waitingOn.periodMonth)}
                </Link>
              </Button>
            ) : null}
          </Card>
        </section>

        <section className="flex flex-col gap-3">
          <h2 className="text-sm font-semibold text-muted-foreground">
            History
          </h2>
          {history.total === 0 ? (
            <EmptyState
              icon={Recycle}
              title="No submissions yet"
              description="Your monthly hand-ins will show up here once you submit."
            />
          ) : (
            <>
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
                  {history.rows.map((row) => (
                    <TableRow key={row.submission.id}>
                      <TableCell className="font-medium whitespace-nowrap">
                        {row.periodMonth ? formatMonth(row.periodMonth) : "—"}
                      </TableCell>
                      {materials.map((m) => (
                        <TableCell
                          key={m.id}
                          className="text-right tabular-nums"
                        >
                          {formatQuantity(row.quantities[m.id] ?? 0)}
                        </TableCell>
                      ))}
                      <TableCell>
                        <Badge
                          tone={
                            MEMBER_SUBMISSION_STATUS_TONE[row.submission.status]
                          }
                        >
                          {
                            MEMBER_SUBMISSION_STATUS_LABEL[
                              row.submission.status
                            ]
                          }
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
              <Pagination
                page={history.page}
                pageSize={history.pageSize}
                total={history.total}
              />
            </>
          )}
        </section>
      </div>
    </>
  );
}

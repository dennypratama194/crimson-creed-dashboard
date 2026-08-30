import type { Metadata } from "next";
import { CircleAlert, CircleCheck, Clock, Recycle } from "lucide-react";

import { MEMBER_SUBMISSION_STATUS_LABEL } from "@/lib/constants/labels";
import { MEMBER_SUBMISSION_STATUS_TONE } from "@/lib/constants/status-config";
import {
  currentPeriodMonth,
  getMaterialTypes,
  getMonthTargets,
  getMyMonthSubmission,
  listMyMemberSubmissions,
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

  const [materials, { submission, quantities }, targets, history] =
    await Promise.all([
      getMaterialTypes(),
      getMyMonthSubmission(periodMonth),
      getMonthTargets(periodMonth),
      listMyMemberSubmissions(),
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

        {submission ? (
          <Card className="flex flex-col gap-4 p-5">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold text-muted-foreground">
                {monthLabel} — your figures
              </h2>
              <Badge tone={MEMBER_SUBMISSION_STATUS_TONE[submission.status]}>
                {MEMBER_SUBMISSION_STATUS_LABEL[submission.status]}
              </Badge>
            </div>
            <dl className="grid grid-cols-2 gap-4 sm:grid-cols-3">
              {materials.map((m) => {
                const target = targets[m.id] ?? 0;
                const value = quantities[m.id] ?? 0;
                const short = target > 0 && value < target;
                return (
                  <div key={m.id} className="flex flex-col gap-0.5">
                    <dt className="text-xs text-muted-foreground">{m.name}</dt>
                    <dd className="text-lg font-semibold tabular-nums">
                      {formatQuantity(value)}
                      {target > 0 ? (
                        <span
                          className={cn(
                            "ml-1 text-xs font-normal",
                            short
                              ? "text-tone-warning-fg"
                              : "text-muted-foreground",
                          )}
                        >
                          / {formatQuantity(target)}
                        </span>
                      ) : null}
                    </dd>
                  </div>
                );
              })}
            </dl>
          </Card>
        ) : null}

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
            <Table className="min-w-[560px]">
              <TableHeader>
                <TableRow>
                  <TableHead>Month</TableHead>
                  {materials.map((m) => (
                    <TableHead key={m.id} className="text-right">
                      {m.code}
                    </TableHead>
                  ))}
                  <TableHead>Status</TableHead>
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

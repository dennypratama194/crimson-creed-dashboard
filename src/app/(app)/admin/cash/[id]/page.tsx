import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";

import {
  CASH_CATEGORY_LABEL,
  CASH_DIRECTION_LABEL,
  CASH_ENTRY_SOURCE_LABEL,
} from "@/lib/constants/labels";
import { CASH_DIRECTION_TONE } from "@/lib/constants/status-config";
import { getCashEntryDetail } from "@/lib/db/cash";
import { formatDateTime, formatMoney } from "@/lib/format";
import { PageHeader } from "@/components/patterns/page-header";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { ReverseEntryButton } from "@/app/(app)/admin/cash/[id]/reverse-entry-button";
import { signedMoney } from "@/app/(app)/admin/cash/ledger-table";

export const metadata: Metadata = { title: "Cash entry" };

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className="text-sm">{children}</span>
    </div>
  );
}

export default async function CashEntryPage({
  params,
}: PageProps<"/admin/cash/[id]">) {
  const { id } = await params;
  const detail = await getCashEntryDetail(id);
  if (!detail) notFound();

  const { entry, createdByName, reversedBy, reverses } = detail;
  const isReversal = !!entry.reverses_entry_id;
  const canReverse = entry.source === "MANUAL" && !reversedBy && !isReversal;

  return (
    <>
      <PageHeader
        title={
          <span className="flex items-center gap-2">
            <span className="font-mono">{entry.entry_number}</span>
            <Badge tone={CASH_DIRECTION_TONE[entry.direction]}>
              {CASH_DIRECTION_LABEL[entry.direction]}
            </Badge>
          </span>
        }
        description={CASH_CATEGORY_LABEL[entry.category]}
        actions={
          canReverse ? (
            <ReverseEntryButton
              entryId={entry.id}
              entryNumber={entry.entry_number}
            />
          ) : null
        }
      />

      <div className="flex max-w-2xl flex-col gap-6">
        <Card className="grid gap-4 p-5 sm:grid-cols-2">
          <Row label="Amount">
            <span
              className={
                entry.direction === "IN"
                  ? "font-medium text-tone-success-fg"
                  : "font-medium text-tone-error-fg"
              }
            >
              {signedMoney(entry.direction, entry.amount)}
            </span>
          </Row>
          <Row label="Balance after">{formatMoney(entry.balance_after)}</Row>
          <Row label="Date">{formatDateTime(entry.occurred_at)}</Row>
          <Row label="Source">{CASH_ENTRY_SOURCE_LABEL[entry.source]}</Row>
          <Row label="Recorded by">{createdByName ?? "—"}</Row>
          <Row label="Recorded at">{formatDateTime(entry.created_at)}</Row>
        </Card>

        {entry.note ? (
          <Card className="p-5">
            <Row label="Note">{entry.note}</Row>
          </Card>
        ) : null}

        {reverses ? (
          <p className="rounded-md border border-tone-info-border bg-tone-info-bg px-3 py-2 text-sm text-tone-info-fg">
            This entry reverses{" "}
            <Link
              href={`/admin/cash/${reverses.id}`}
              className="font-mono underline"
            >
              {reverses.entry_number}
            </Link>
            .
          </p>
        ) : null}

        {reversedBy ? (
          <p className="rounded-md border border-tone-warning-border bg-tone-warning-bg px-3 py-2 text-sm text-tone-warning-fg">
            Reversed by{" "}
            <Link
              href={`/admin/cash/${reversedBy.id}`}
              className="font-mono underline"
            >
              {reversedBy.entry_number}
            </Link>
            .
          </p>
        ) : null}
      </div>
    </>
  );
}

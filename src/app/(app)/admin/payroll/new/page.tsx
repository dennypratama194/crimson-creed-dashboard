import type { Metadata } from "next";

import { PageHeader } from "@/components/patterns/page-header";
import { NewRunForm } from "@/app/(app)/admin/payroll/new/new-run-form";

export const metadata: Metadata = { title: "New payroll run" };

/** First and last day of the previous calendar month, in UTC, as YYYY-MM-DD. */
function previousMonthRange(): { start: string; end: string } {
  const now = new Date();
  const firstOfThisMonth = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1);
  const end = new Date(firstOfThisMonth - 24 * 60 * 60 * 1000);
  const start = new Date(Date.UTC(end.getUTCFullYear(), end.getUTCMonth(), 1));
  return {
    start: start.toISOString().slice(0, 10),
    end: end.toISOString().slice(0, 10),
  };
}

export default function NewPayrollRunPage() {
  const { start, end } = previousMonthRange();

  return (
    <>
      <PageHeader
        title="New payroll run"
        description="Choose the pay period. Approved production logs dated in this range will be rolled up."
      />
      <NewRunForm defaultStart={start} defaultEnd={end} />
    </>
  );
}

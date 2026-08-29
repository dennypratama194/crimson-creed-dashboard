import { PageHeader } from "@/components/patterns/page-header";
import { Skeleton } from "@/components/ui/skeleton";

export default function LoadingPayroll() {
  return (
    <>
      <PageHeader
        title="Payroll"
        description="Roll approved production into per-member pay for a period, then mark it paid."
      />
      <div className="overflow-hidden rounded-xl border border-border">
        <Skeleton className="h-10 w-full rounded-none" />
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton
            key={i}
            className="mx-4 my-3 h-6"
            style={{ width: `${60 + ((i * 9) % 30)}%` }}
          />
        ))}
      </div>
    </>
  );
}

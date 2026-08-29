import { PageHeader } from "@/components/patterns/page-header";
import { Skeleton } from "@/components/ui/skeleton";

export default function LoadingCash() {
  return (
    <>
      <PageHeader
        title="Company cash"
        description="The company treasury. Every income and expense adjusts the balance."
      />
      <div className="flex flex-col gap-6">
        <Skeleton className="h-24 w-full rounded-xl" />
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-24 rounded-xl" />
          ))}
        </div>
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
      </div>
    </>
  );
}

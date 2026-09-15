import { PageHeader } from "@/components/patterns/page-header";
import { Skeleton } from "@/components/ui/skeleton";

export default function LoadingMyDistribution() {
  return (
    <>
      <PageHeader
        title="Distribution"
        description="Stock you have taken from the stash and what you still owe the company. A Super Admin records the hand-back."
      />
      <div className="flex flex-col gap-6">
        <div className="grid gap-4 sm:grid-cols-2">
          {Array.from({ length: 2 }).map((_, i) => (
            <Skeleton key={i} className="h-28 w-full rounded-xl" />
          ))}
        </div>
        <div className="flex flex-col gap-4">
          <Skeleton className="h-9 w-56" />
          <div className="overflow-hidden rounded-xl border border-border">
            <Skeleton className="h-10 w-full rounded-none" />
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton
                key={i}
                className="mx-4 my-3 h-6"
                style={{ width: `${70 + ((i * 7) % 25)}%` }}
              />
            ))}
          </div>
        </div>
      </div>
    </>
  );
}

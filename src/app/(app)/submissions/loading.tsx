import { PageHeader } from "@/components/patterns/page-header";
import { Skeleton } from "@/components/ui/skeleton";

export default function LoadingSubmissions() {
  return (
    <>
      <PageHeader
        title="Monthly submissions"
        description="Hand in your metal scrap, empty bottles and cans each month."
      />
      <div className="flex flex-col gap-6">
        <Skeleton className="h-24 w-full rounded-xl" />
        <Skeleton className="h-32 w-full rounded-xl" />
        <div className="flex flex-col gap-3">
          <Skeleton className="h-5 w-24" />
          <div className="overflow-hidden rounded-xl border border-border">
            <Skeleton className="h-10 w-full rounded-none" />
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton
                key={i}
                className="mx-4 my-3 h-6"
                style={{ width: `${60 + ((i * 9) % 30)}%` }}
              />
            ))}
          </div>
        </div>
      </div>
    </>
  );
}
